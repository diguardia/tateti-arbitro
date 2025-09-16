const axios = require('axios');

const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];

function cloneBoard(board) {
  return board.slice();
}

function checkWinner(board) {
  for (const [a, b, c] of WINNING_COMBINATIONS) {
    if (board[a] !== 0 && board[a] === board[b] && board[a] === board[c]) {
      return { playerId: board[a], combo: [a, b, c] };
    }
  }
  return null;
}

async function requestMove(player, board, playerId, timeoutMs) {
  const host = player.host || 'localhost';
  const protocol = player.protocol || 'http';
  const url = `${protocol}://${host}:${player.port}/move`;

  try {
    const response = await axios.get(url, {
      params: {
        board: JSON.stringify(board),
        player: playerId
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

function normalizePlayers(players) {
  if (!Array.isArray(players) || players.length !== 2) {
    throw new Error('Se requieren exactamente dos jugadores.');
  }

  return players.map((player, index) => {
    const normalized = {
      id: index + 1,
      name: (player && player.name ? String(player.name).trim() : '') || `Jugador ${index + 1}`,
      port: Number(player && player.port)
    };

    if (!Number.isInteger(normalized.port) || normalized.port <= 0) {
      throw new Error(`El puerto del jugador ${normalized.name} es invalido.`);
    }

    if (player && player.host) {
      normalized.host = player.host;
    }

    if (player && player.protocol) {
      normalized.protocol = player.protocol;
    }

    return normalized;
  });
}

async function runMatch(players, options = {}) {
  const timeoutMs = options.timeoutMs ?? 3000;
  const normalizedPlayers = normalizePlayers(players);
  const board = Array(9).fill(0);
  const history = [];

  let winner = null;
  let winningLine = null;
  let result = 'incomplete';
  let message = '';

  for (let turn = 0; turn < 9; turn += 1) {
    const playerIndex = turn % 2;
    const currentPlayer = normalizedPlayers[playerIndex];
    const opponent = normalizedPlayers[(playerIndex + 1) % 2];

    const step = {
      turn: turn + 1,
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      boardBefore: cloneBoard(board)
    };

    const { move, error } = await requestMove(currentPlayer, board, currentPlayer.id, timeoutMs);

    if (error) {
      step.error = error;
      history.push(step);
      winner = opponent;
      result = 'error';
      message = `${currentPlayer.name} no pudo realizar un movimiento: ${error}`;
      break;
    }

    step.move = move;

    if (!Number.isInteger(move) || move < 0 || move > 8) {
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

    const winCheck = checkWinner(board);
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
    players: normalizedPlayers,
    history,
    winner,
    winningLine,
    result,
    message,
    finalBoard: cloneBoard(board)
  };
}

module.exports = {
  runMatch
};
