const axios = require('axios');

const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_BOARD_SIZE = 3;
const DEFAULT_WIN_LENGTH = 4;
const WINNING_LINES_CACHE = new Map();

function cloneBoard(board) {
  return board.slice();
}

function resolveTimeout(rawTimeout) {
  const parsed = Number.parseInt(rawTimeout, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

function ensureBoardSettings(options = {}) {
  const sizeCandidate = Number.parseInt(options.boardSize, 10);
  const boardSize = sizeCandidate === 5 ? 5 : DEFAULT_BOARD_SIZE;
  const maximumAllowedWinLength = boardSize >= DEFAULT_WIN_LENGTH ? DEFAULT_WIN_LENGTH : boardSize;

  let winLengthCandidate = Number.parseInt(options.winLength, 10);
  if (!Number.isInteger(winLengthCandidate)) {
    winLengthCandidate = maximumAllowedWinLength;
  }

  if (winLengthCandidate <= 0) {
    winLengthCandidate = maximumAllowedWinLength;
  }

  if (boardSize >= DEFAULT_WIN_LENGTH && winLengthCandidate < DEFAULT_WIN_LENGTH) {
    winLengthCandidate = DEFAULT_WIN_LENGTH;
  }

  if (winLengthCandidate > maximumAllowedWinLength) {
    winLengthCandidate = maximumAllowedWinLength;
  }

  return {
    boardSize,
    winLength: winLengthCandidate
  };
}

function ensurePath(pathValue) {
  if (!pathValue) {
    return '/move';
  }

  const trimmed = String(pathValue).trim();
  if (!trimmed) {
    return '/move';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function sanitizeUrl(rawUrl) {
  const trimmed = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!trimmed) {
    throw new Error('La URL del jugador es invalida.');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/move';
    }
    return parsed.toString();
  } catch (error) {
    throw new Error('La URL del jugador es invalida.');
  }
}

function normalizePlayer(player, index, options = {}) {
  const allowHuman = Boolean(options.allowHuman);
  const defaultName = `Jugador ${index + 1}`;

  const normalized = {
    name: (player && player.name ? String(player.name).trim() : '') || defaultName,
    type: player && player.type === 'human' ? 'human' : 'bot',
    originalIndex: index
  };

  if (normalized.type === 'human') {
    if (!allowHuman) {
      throw new Error(`El jugador ${normalized.name} debe ser un bot para este modo.`);
    }
    return normalized;
  }

  const rawUrl = player && player.url;
  if (rawUrl) {
    normalized.url = sanitizeUrl(rawUrl);
    return normalized;
  }

  const portValue = player && player.port;
  const port = Number.parseInt(portValue, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`El puerto del jugador ${normalized.name} es invalido.`);
  }

  normalized.port = port;
  const hostValue = player && player.host ? String(player.host).trim() : '';
  normalized.host = hostValue || 'localhost';

  const protocolValue = player && player.protocol ? String(player.protocol).trim().toLowerCase() : '';
  normalized.protocol = protocolValue === 'https' ? 'https' : 'http';

  const pathValue = player && player.path ? String(player.path) : '';
  normalized.path = ensurePath(pathValue);

  return normalized;
}

function normalizePlayers(players, options = {}) {
  if (!Array.isArray(players) || players.length !== 2) {
    throw new Error('Se requieren exactamente dos jugadores.');
  }

  return players.map((player, index) => ({
    ...normalizePlayer(player, index, options),
    id: index + 1
  }));
}

function buildWinningLines(size, winLength) {
  const lines = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col <= size - winLength; col += 1) {
      const line = [];
      for (let offset = 0; offset < winLength; offset += 1) {
        line.push(row * size + col + offset);
      }
      lines.push(line);
    }
  }

  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row <= size - winLength; row += 1) {
      const line = [];
      for (let offset = 0; offset < winLength; offset += 1) {
        line.push((row + offset) * size + col);
      }
      lines.push(line);
    }
  }

  for (let row = 0; row <= size - winLength; row += 1) {
    for (let col = 0; col <= size - winLength; col += 1) {
      const line = [];
      for (let offset = 0; offset < winLength; offset += 1) {
        line.push((row + offset) * size + (col + offset));
      }
      lines.push(line);
    }
  }

  for (let row = 0; row <= size - winLength; row += 1) {
    for (let col = winLength - 1; col < size; col += 1) {
      const line = [];
      for (let offset = 0; offset < winLength; offset += 1) {
        line.push((row + offset) * size + (col - offset));
      }
      lines.push(line);
    }
  }

  return lines;
}

function getWinningLines(size, winLength) {
  const cacheKey = `${size}x${winLength}`;
  if (!WINNING_LINES_CACHE.has(cacheKey)) {
    WINNING_LINES_CACHE.set(cacheKey, buildWinningLines(size, winLength));
  }
  return WINNING_LINES_CACHE.get(cacheKey);
}

function checkWinner(board, winningLines) {
  for (const line of winningLines) {
    const firstIndex = line[0];
    const playerId = board[firstIndex];
    if (!playerId) {
      continue;
    }

    let hasLine = true;
    for (let i = 1; i < line.length; i += 1) {
      if (board[line[i]] !== playerId) {
        hasLine = false;
        break;
      }
    }

    if (hasLine) {
      return {
        playerId,
        combo: line.slice()
      };
    }
  }

  return null;
}

function buildBotEndpoint(player) {
  if (player.url) {
    return player.url;
  }

  const path = player.path || '/move';
  return `${player.protocol}://${player.host}:${player.port}${path}`;
}

async function requestMove(player, board, playerId, options = {}) {
  const timeoutMs = resolveTimeout(options.timeoutMs);
  const { boardSize, winLength } = ensureBoardSettings(options);
  const endpoint = buildBotEndpoint(player);

  try {
    const response = await axios.get(endpoint, {
      params: {
        board: JSON.stringify(board),
        player: playerId,
        size: boardSize,
        winLength
      },
      timeout: timeoutMs
    });

    const data = response.data || {};
    let move = data.movimiento;

    if (typeof move === 'undefined') {
      move = data.move;
    }

    if (typeof move === 'string' && move !== '') {
      move = Number.parseInt(move, 10);
    }

    return { move };
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return { error: 'Tiempo de espera agotado al solicitar el movimiento.' };
    }

    if (error.response) {
      return {
        error: `Respuesta ${error.response.status} al solicitar el movimiento.`
      };
    }

    return { error: 'No fue posible contactar al jugador.' };
  }
}

async function runMatch(players, options = {}) {
  const { boardSize, winLength } = ensureBoardSettings(options);
  const timeoutMs = resolveTimeout(options.timeoutMs);
  const normalizedPlayers = normalizePlayers(players, { allowHuman: options.allowHuman });

  if (normalizedPlayers.some((player) => player.type !== 'bot')) {
    throw new Error('El arbitro solo admite partidas entre bots.');
  }

  const board = Array(boardSize * boardSize).fill(0);
  const history = [];
  const winningLines = getWinningLines(boardSize, winLength);

  let winner = null;
  let winningLine = null;
  let result = 'incomplete';
  let message = '';

  for (let turn = 0; turn < board.length; turn += 1) {
    const playerIndex = turn % normalizedPlayers.length;
    const currentPlayer = normalizedPlayers[playerIndex];
    const opponent = normalizedPlayers[(playerIndex + 1) % normalizedPlayers.length];

    const step = {
      turn: turn + 1,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      boardBefore: cloneBoard(board)
    };

    const { move, error } = await requestMove(currentPlayer, board, currentPlayer.id, {
      timeoutMs,
      boardSize,
      winLength
    });

    if (error || typeof move === 'undefined') {
      step.error = error || 'El bot no respondio con un movimiento valido.';
      history.push(step);
      winner = opponent;
      result = 'error';
      message = `${currentPlayer.name} no pudo realizar un movimiento: ${step.error}`;
      break;
    }

    step.move = move;

    if (!Number.isInteger(move) || move < 0 || move >= board.length) {
      step.error = 'Movimiento fuera de rango.';
      history.push(step);
      winner = opponent;
      result = 'error';
      message = `${currentPlayer.name} devolvio un movimiento invalido.`;
      break;
    }

    if (board[move] !== 0) {
      step.error = `La casilla ${move} ya esta ocupada.`;
      history.push(step);
      winner = opponent;
      result = 'error';
      message = `${currentPlayer.name} eligio una casilla ocupada.`;
      break;
    }

    board[move] = currentPlayer.id;
    step.boardAfter = cloneBoard(board);
    history.push(step);

    const winCheck = checkWinner(board, winningLines);
    if (winCheck) {
      winner = currentPlayer;
      winningLine = winCheck.combo;
      result = 'win';
      message = `${currentPlayer.name} gano.`;
      break;
    }
  }

  if (!winner && result !== 'error') {
    if (board.every((cell) => cell !== 0)) {
      result = 'draw';
      message = 'Empate.';
    } else {
      message = 'La partida no finalizo correctamente.';
    }
  }

  return {
    boardSize,
    winLength,
    timeoutMs,
    players: normalizedPlayers,
    history,
    winner,
    winningLine,
    result,
    message,
    finalBoard: cloneBoard(board)
  };
}

function ensureBoardState(board, size) {
  const expected = size * size;
  if (!Array.isArray(board) || board.length !== expected) {
    throw new Error(`El tablero debe contener ${expected} casillas.`);
  }

  return board.map((value) => {
    const numeric = Number.parseInt(value, 10);
    return Number.isInteger(numeric) ? numeric : 0;
  });
}

async function requestBotMove(player, board, options = {}) {
  const { boardSize, winLength } = ensureBoardSettings(options);
  const timeoutMs = resolveTimeout(options.timeoutMs);
  const normalizedPlayer = normalizePlayer(player, 0, { allowHuman: false });

  if (normalizedPlayer.type !== 'bot') {
    throw new Error(`El jugador ${normalizedPlayer.name} debe ser un bot.`);
  }

  const state = ensureBoardState(board, boardSize);
  const playerId = Number.parseInt(options.playerId, 10);
  const resolvedPlayerId = Number.isInteger(playerId) ? playerId : 1;

  return requestMove(normalizedPlayer, state, resolvedPlayerId, {
    timeoutMs,
    boardSize,
    winLength
  });
}

async function runTournament(players, options = {}) {
  const { boardSize, winLength } = ensureBoardSettings(options);
  const timeoutMs = resolveTimeout(options.timeoutMs);
  const basePlayers = normalizePlayers(players, { allowHuman: false });

  if (basePlayers.some((player) => player.type !== 'bot')) {
    throw new Error('El modo torneo solo admite bots.');
  }

  const scoreboard = basePlayers.map((player) => ({
    name: player.name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    errors: 0,
    points: 0
  }));

  const orders = [
    [0, 1],
    [0, 1],
    [0, 1],
    [1, 0],
    [1, 0],
    [1, 0]
  ];

  const matches = [];

  for (let index = 0; index < orders.length; index += 1) {
    const order = orders[index];
    const homeIndex = order[0];
    const awayIndex = order[1];

    const matchResult = await runMatch(
      [players[homeIndex], players[awayIndex]],
      { boardSize, winLength, timeoutMs, allowHuman: false }
    );

    matches.push({
      number: index + 1,
      home: basePlayers[homeIndex].name,
      away: basePlayers[awayIndex].name,
      result: matchResult.result,
      message: matchResult.message,
      winner: matchResult.winner ? {
        id: matchResult.winner.id,
        name: matchResult.winner.name
      } : null,
      history: matchResult.history,
      winningLine: matchResult.winningLine,
      finalBoard: matchResult.finalBoard
    });

    scoreboard[homeIndex].played += 1;
    scoreboard[awayIndex].played += 1;

    if (matchResult.result === 'win' && matchResult.winner) {
      const winnerIndex = matchResult.winner.id === 1 ? homeIndex : awayIndex;
      const loserIndex = winnerIndex === homeIndex ? awayIndex : homeIndex;
      scoreboard[winnerIndex].wins += 1;
      scoreboard[winnerIndex].points += 3;
      scoreboard[loserIndex].losses += 1;
    } else if (matchResult.result === 'draw') {
      scoreboard[homeIndex].draws += 1;
      scoreboard[awayIndex].draws += 1;
      scoreboard[homeIndex].points += 1;
      scoreboard[awayIndex].points += 1;
    } else if (matchResult.result === 'error') {
      const failingStep = [...matchResult.history].reverse().find((step) => step.error);
      if (failingStep) {
        const failingIndex = failingStep.playerId === 1 ? homeIndex : awayIndex;
        scoreboard[failingIndex].errors += 1;
      }

      if (matchResult.winner) {
        const winnerIndex = matchResult.winner.id === 1 ? homeIndex : awayIndex;
        const loserIndex = winnerIndex === homeIndex ? awayIndex : homeIndex;
        scoreboard[winnerIndex].wins += 1;
        scoreboard[winnerIndex].points += 3;
        scoreboard[loserIndex].losses += 1;
      }
    }
  }

  const standings = scoreboard
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points;
      }
      if (b.wins !== a.wins) {
        return b.wins - a.wins;
      }
      return a.name.localeCompare(b.name);
    });

  return {
    boardSize,
    winLength,
    timeoutMs,
    matches,
    scoreboard,
    standings
  };
}

module.exports = {
  runMatch,
  runTournament,
  requestBotMove,
  checkWinner
};


