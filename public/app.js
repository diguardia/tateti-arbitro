const form = document.getElementById('matchForm');
const statusEl = document.getElementById('status');
const boardEl = document.getElementById('board');
const moveList = document.getElementById('moves');
const swapButton = document.getElementById('swapPlayers');
const tournamentResultsEl = document.getElementById('tournamentResults');
const tournamentTableEl = document.getElementById('tournamentTable');
const tournamentMatchesEl = document.getElementById('tournamentMatches');
const tournamentHintEl = document.getElementById('tournamentHint');

const SYMBOLS = {
  0: '',
  1: 'X',
  2: 'O'
};



let cells = [];
let currentBoardSize = 3;

const winningLinesCache = new Map();

const interactiveState = {
  running: false,
  awaitingHuman: false,
  resolveHumanMove: null,
  board: [],
  boardSize: currentBoardSize,
  winLength: currentBoardSize === 3 ? 3 : 4
};

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function cloneBoard(board) {
  return board.slice();
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
  const key = `${size}x${winLength}`;
  if (!winningLinesCache.has(key)) {
    winningLinesCache.set(key, buildWinningLines(size, winLength));
  }
  return winningLinesCache.get(key);
}

function checkWinner(board, winningLines) {
  for (const line of winningLines) {
    const firstIndex = line[0];
    const playerId = board[firstIndex];
    if (!playerId) {
      continue;
    }

    let hasLine = true;
    for (let index = 1; index < line.length; index += 1) {
      if (board[line[index]] !== playerId) {
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

function boardFull(board) {
  return board.every((cell) => cell !== 0);
}

function buildBoard(size) {
  currentBoardSize = size;
  boardEl.classList.remove('board--size-3', 'board--size-5');
  boardEl.classList.add(`board--size-${size}`);
  boardEl.innerHTML = '';
  cells = [];

  for (let index = 0; index < size * size; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = String(index);
    cell.dataset.symbol = '';
    boardEl.appendChild(cell);
    cells.push(cell);
  }
}

function resetBoardVisual() {
  cells.forEach((cell) => {
    cell.dataset.symbol = '';
    cell.classList.remove('winner');
  });
}

function clearWinningHighlights() {
  cells.forEach((cell) => cell.classList.remove('winner'));
}

function updateBoard(boardState) {
  if (!Array.isArray(boardState) || boardState.length !== cells.length) {
    resetBoardVisual();
    return;
  }

  boardState.forEach((value, index) => {
    const cell = cells[index];
    cell.dataset.symbol = SYMBOLS[value] || '';
  });
}

function highlightWinningCells(winningLine) {
  clearWinningHighlights();
  if (!Array.isArray(winningLine)) {
    return;
  }

  winningLine.forEach((index) => {
    const cell = cells[index];
    if (cell) {
      cell.classList.add('winner');
    }
  });
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', Boolean(isError));
}

function resetMoveList() {
  moveList.innerHTML = '';
}

function formatCellPosition(index, size) {
  if (!Number.isInteger(index) || size <= 0) {
    return `casilla ${index + 1}`;
  }
  const row = Math.floor(index / size) + 1;
  const column = (index % size) + 1;
  return `fila ${row}, columna ${column}`;
}

function renderHistoryEntry(step, boardSize) {
  const entry = document.createElement('li');

  if (step.error) {
    entry.classList.add('error');
    const strong = document.createElement('strong');
    strong.textContent = step.playerName;
    entry.appendChild(strong);
    entry.append(`: ${step.error}`);
    return entry;
  }

  const positionLabel = formatCellPosition(step.move, boardSize);
  entry.textContent = `Turno ${step.turn}: ${step.playerName} jugo en ${positionLabel}.`;
  return entry;
}

function appendMoveEntry(step, boardSize) {
  moveList.appendChild(renderHistoryEntry(step, boardSize));
}

function clearTournament() {
  tournamentResultsEl.hidden = true;
  tournamentTableEl.innerHTML = '';
  tournamentMatchesEl.innerHTML = '';
}

function renderTournament(result, boardSize) {
  if (!result) {
    clearTournament();
    return;
  }

  tournamentResultsEl.hidden = false;

  const standings = Array.isArray(result.standings) ? result.standings : [];
  const table = document.createElement('table');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>Jugador</th><th>PJ</th><th>PG</th><th>PE</th><th>PP</th><th>Errores</th><th>Puntos</th>';
  table.appendChild(headerRow);

  standings.forEach((entry) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${entry.name}</td>
      <td>${entry.played}</td>
      <td>${entry.wins}</td>
      <td>${entry.draws}</td>
      <td>${entry.losses}</td>
      <td>${entry.errors}</td>
      <td>${entry.points}</td>
    `;
    table.appendChild(row);
  });

  tournamentTableEl.innerHTML = '';
  tournamentTableEl.appendChild(table);

  const matches = Array.isArray(result.matches) ? result.matches : [];
  const list = document.createElement('ul');

  matches.forEach((match) => {
    const item = document.createElement('li');
    const winnerText = match.winner && match.result === 'win' ? ` (Ganador: ${match.winner.name})` : '';
    item.textContent = `Partido ${match.number}: ${match.home} vs ${match.away} - ${match.message}${winnerText}`;
    list.appendChild(item);
  });

  tournamentMatchesEl.innerHTML = '';
  tournamentMatchesEl.appendChild(list);

  if (matches.length > 0) {
    const lastMatch = matches[matches.length - 1];
    if (Array.isArray(lastMatch.finalBoard)) {
      updateBoard(lastMatch.finalBoard);
      highlightWinningCells(lastMatch.winningLine);
    } else {
      resetBoardVisual();
      clearWinningHighlights();
    }
  }
}

function setFormDisabled(isDisabled) {
  const elements = Array.from(form.elements);
  elements.forEach((element) => {
    if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      element.disabled = isDisabled;
    }
  });
}

function parsePlayerPort(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getFormConfig() {
  const data = new FormData(form);
  const mode = data.get('mode') === 'tournament' ? 'tournament' : 'single';
  const sizeValue = Number.parseInt(data.get('boardSize'), 10);
  const boardSize = sizeValue === 5 ? 5 : 3;
  const timeoutValue = Number.parseInt(data.get('timeout'), 10);
  const timeoutMs = Number.isInteger(timeoutValue) && timeoutValue > 0 ? timeoutValue : 3000;

  const players = [1, 2].map((index) => {
    const prefix = `player${index}`;
    const name = (data.get(`${prefix}Name`) || '').trim();
    const type = data.get(`${prefix}Type`) === 'human' ? 'human' : 'bot';
    const host = (data.get(`${prefix}Host`) || '').trim();
    const url = (data.get(`${prefix}Url`) || '').trim();
    const port = parsePlayerPort(data.get(`${prefix}Port`));

    return {
      id: index,
      name,
      type,
      host,
      url,
      port
    };
  });

  return {
    mode,
    boardSize,
    winLength: boardSize === 3 ? 3 : 4,
    timeoutMs,
    players
  };
}

function normalizePlayers(players) {
  return players.map((player, index) => {
    const name = player.name || `Jugador ${index + 1}`;
    if (player.type === 'bot') {
      return {
        id: index + 1,
        name,
        type: 'bot',
        bot: {
          host: player.host || '',
          port: player.port,
          url: player.url || ''
        }
      };
    }

    return {
      id: index + 1,
      name,
      type: 'human'
    };
  });
}

function validateConfig(config) {
  const normalizedPlayers = normalizePlayers(config.players);
  const errors = [];

  normalizedPlayers.forEach((player) => {
    if (player.type === 'bot') {
      const hasUrl = player.bot.url.length > 0;
      const hasPort = Number.isInteger(player.bot.port);
      if (!hasUrl && !hasPort) {
        errors.push(`Configura un puerto o una URL para ${player.name}.`);
      }
    }
  });

  const humanCount = normalizedPlayers.filter((player) => player.type === 'human').length;

  if (config.mode === 'tournament' && humanCount > 0) {
    errors.push('El modo torneo solo admite bots.');
  }

  let matchType = 'bot-vs-bot';
  if (humanCount === 1) {
    matchType = 'bot-vs-human';
  } else if (humanCount === 2) {
    matchType = 'human-vs-human';
  }

  return {
    ...config,
    players: normalizedPlayers,
    matchType,
    errors
  };
}

function buildBackendPlayer(player) {
  if (player.type !== 'bot') {
    return null;
  }

  const payload = {
    name: player.name
  };

  if (player.bot.url) {
    payload.url = player.bot.url;
  }

  if (Number.isInteger(player.bot.port)) {
    payload.port = player.bot.port;
  }

  if (player.bot.host) {
    payload.host = player.bot.host;
  }

  return payload;
}

function buildBotRequest(player) {
  const payload = buildBackendPlayer(player);
  return {
    ...payload,
    type: 'bot'
  };
}

async function animateHistory(history, winningLine, boardSize) {
  resetMoveList();
  resetBoardVisual();
  clearWinningHighlights();

  for (const step of history) {
    appendMoveEntry(step, boardSize);
    const boardState = step.boardAfter || step.boardBefore;
    if (Array.isArray(boardState)) {
      await delay(650);
      updateBoard(boardState);
    }

    if (step.error) {
      break;
    }
  }

  highlightWinningCells(winningLine);
}

async function playBotVsBot(config) {
  const payload = {
    player1: buildBackendPlayer(config.players[0]),
    player2: buildBackendPlayer(config.players[1]),
    timeoutMs: config.timeoutMs,
    boardSize: config.boardSize,
    winLength: config.winLength,
    matchType: 'bot-vs-bot'
  };

  const response = await window.fetch('/api/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo iniciar la partida.');
  }

  await animateHistory(data.history, data.winningLine, config.boardSize);

  const isError = data.result === 'error';
  const winnerName = data.winner ? data.winner.name : null;

  if (data.result === 'win' && winnerName) {
    setStatus(`${data.message} (${winnerName})`, false);
  } else {
    setStatus(data.message, isError);
  }
}

async function playTournament(config) {
  const payload = {
    player1: buildBackendPlayer(config.players[0]),
    player2: buildBackendPlayer(config.players[1]),
    timeoutMs: config.timeoutMs,
    boardSize: config.boardSize,
    winLength: config.winLength
  };

  const response = await window.fetch('/api/tournament', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo ejecutar el torneo.');
  }

  renderTournament(data, config.boardSize);

  const champion = Array.isArray(data.standings) && data.standings.length > 0 ? data.standings[0] : null;
  if (champion) {
    setStatus(`Torneo finalizado. Campeon: ${champion.name} (${champion.points} pts)`, false);
  } else {
    setStatus('Torneo finalizado.', false);
  }
}

async function requestBotMove(player, board, config) {
  const payload = {
    player: buildBotRequest(player),
    board,
    playerId: player.id,
    boardSize: config.boardSize,
    winLength: config.winLength,
    timeoutMs: config.timeoutMs
  };

  const response = await window.fetch('/api/bot-move', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'No se pudo obtener el movimiento del bot.');
  }

  if (typeof data.move === 'undefined') {
    throw new Error('El bot no respondio con un movimiento valido.');
  }

  return data.move;
}

function waitForHumanMove() {
  return new Promise((resolve) => {
    interactiveState.awaitingHuman = true;
    interactiveState.resolveHumanMove = resolve;
    boardEl.classList.add('board--awaiting');
  });
}

async function playInteractiveMatch(config) {
  const board = Array(config.boardSize * config.boardSize).fill(0);
  const winningLines = getWinningLines(config.boardSize, config.winLength);
  const history = [];

  interactiveState.running = true;
  interactiveState.awaitingHuman = false;
  interactiveState.resolveHumanMove = null;
  interactiveState.board = board;
  interactiveState.boardSize = config.boardSize;
  interactiveState.winLength = config.winLength;

  resetMoveList();
  resetBoardVisual();
  clearWinningHighlights();
  updateBoard(board);

  let winner = null;
  let winningLine = null;
  let result = 'incomplete';
  let message = '';

  for (let turn = 0; turn < board.length; turn += 1) {
    const currentPlayer = config.players[turn % config.players.length];
    const opponent = config.players[(turn + 1) % config.players.length];

    const step = {
      turn: turn + 1,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      boardBefore: cloneBoard(board)
    };

    let move;

    if (currentPlayer.type === 'human') {
      setStatus(`Turno de ${currentPlayer.name}. Selecciona una casilla libre.`, false);
      move = await waitForHumanMove();
    } else {
      setStatus(`Esperando el movimiento de ${currentPlayer.name}...`, false);
      try {
        move = await requestBotMove(currentPlayer, board, config);
      } catch (error) {
        step.error = error.message;
        history.push(step);
        appendMoveEntry(step, config.boardSize);
        winner = opponent;
        result = 'error';
        message = `${currentPlayer.name} no pudo realizar un movimiento: ${step.error}`;
        break;
      }
    }

    step.move = move;

    if (!Number.isInteger(move) || move < 0 || move >= board.length) {
      step.error = 'Movimiento fuera de rango.';
      history.push(step);
      appendMoveEntry(step, config.boardSize);
      winner = opponent;
      result = 'error';
      message = `${currentPlayer.name} devolvio un movimiento invalido.`;
      break;
    }

    if (board[move] !== 0) {
      step.error = `La casilla ${move + 1} ya esta ocupada.`;
      history.push(step);
      appendMoveEntry(step, config.boardSize);
      winner = opponent;
      result = 'error';
      message = `${currentPlayer.name} eligio una casilla ocupada.`;
      break;
    }

    board[move] = currentPlayer.id;
    step.boardAfter = cloneBoard(board);
    history.push(step);
    appendMoveEntry(step, config.boardSize);
    updateBoard(board);

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
    if (boardFull(board)) {
      result = 'draw';
      message = 'Empate.';
    } else {
      message = 'La partida no finalizo correctamente.';
    }
  }

  highlightWinningCells(winningLine);
  setStatus(message, result === 'error');

  interactiveState.running = false;
  interactiveState.awaitingHuman = false;
  interactiveState.resolveHumanMove = null;
  boardEl.classList.remove('board--awaiting');

  return {
    result,
    winner,
    winningLine
  };
}

function updateBotSettingsVisibility() {
  [1, 2].forEach((index) => {
    const typeSelect = form.querySelector(`select[name="player${index}Type"]`);
    const card = form.querySelector(`.player-card[data-player="${index}"]`);
    const botSettings = card ? card.querySelector('.bot-settings') : null;

    if (!botSettings) {
      return;
    }

    if (typeSelect.value === 'bot') {
      botSettings.classList.remove('hidden');
    } else {
      botSettings.classList.add('hidden');
    }
  });
}

function updateTournamentHint() {
  const mode = form.querySelector('input[name="mode"]:checked').value;
  const playersAreBots = [1, 2].every((index) => {
    const typeSelect = form.querySelector(`select[name="player${index}Type"]`);
    return typeSelect.value === 'bot';
  });

  if (mode === 'tournament') {
    tournamentHintEl.hidden = false;
    tournamentHintEl.classList.toggle('error', !playersAreBots);
    tournamentHintEl.textContent = playersAreBots
      ? 'En torneo se juegan 6 partidos: 3 de local cada bot.'
      : 'El modo torneo requiere que ambos jugadores sean bots.';
  } else {
    tournamentHintEl.hidden = true;
  }
}

function swapPlayers() {
  const fields = ['Name', 'Type', 'Host', 'Port', 'Url'];

  fields.forEach((field) => {
    const field1 = form.querySelector(`[name="player1${field}"]`);
    const field2 = form.querySelector(`[name="player2${field}"]`);

    if (!field1 || !field2) {
      return;
    }

    const tempValue = field1.value;
    field1.value = field2.value;
    field2.value = tempValue;
  });

  updateBotSettingsVisibility();
  updateTournamentHint();
}

boardEl.addEventListener('click', (event) => {
  if (!interactiveState.running || !interactiveState.awaitingHuman) {
    return;
  }

  const target = event.target instanceof HTMLElement ? event.target.closest('.cell') : null;
  if (!target) {
    return;
  }

  const index = Number.parseInt(target.dataset.index, 10);
  if (!Number.isInteger(index)) {
    return;
  }

  if (interactiveState.board[index] !== 0) {
    return;
  }

  interactiveState.awaitingHuman = false;
  boardEl.classList.remove('board--awaiting');

  const resolver = interactiveState.resolveHumanMove;
  interactiveState.resolveHumanMove = null;
  if (resolver) {
    resolver(index);
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (interactiveState.running) {
    return;
  }

  const config = validateConfig(getFormConfig());

  if (config.errors.length > 0) {
    setStatus(config.errors[0], true);
    return;
  }

  setStatus('Configurando partida...', false);
  setFormDisabled(true);
  clearTournament();

  if (currentBoardSize !== config.boardSize) {
    buildBoard(config.boardSize);
  } else {
    resetBoardVisual();
    clearWinningHighlights();
  }

  try {
    if (config.mode === 'tournament') {
      await playTournament(config);
    } else if (config.matchType === 'bot-vs-bot') {
      await playBotVsBot(config);
    } else {
      await playInteractiveMatch(config);
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    if (!interactiveState.running) {
      setFormDisabled(false);
    } else {
      window.setTimeout(() => setFormDisabled(false), 0);
    }
  }
});

if (swapButton) {
  swapButton.addEventListener('click', swapPlayers);
}

form.querySelectorAll('select[name$="Type"]').forEach((select) => {
  select.addEventListener('change', () => {
    updateBotSettingsVisibility();
    updateTournamentHint();
  });
});

form.querySelectorAll('input[name="mode"]').forEach((input) => {
  input.addEventListener('change', () => {
    updateTournamentHint();
    clearTournament();
  });
});

form.querySelectorAll('input[name="boardSize"]').forEach((input) => {
  input.addEventListener('change', () => {
    const size = Number.parseInt(input.value, 10) === 5 ? 5 : 3;
    buildBoard(size);
    resetBoardVisual();
    clearWinningHighlights();
  });
});

buildBoard(currentBoardSize);
resetBoardVisual();
updateBotSettingsVisibility();
updateTournamentHint();
setStatus('Listo para arbitrar.', false);








