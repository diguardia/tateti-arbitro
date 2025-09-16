const form = document.getElementById('matchForm');
const statusEl = document.getElementById('status');
const boardEl = document.getElementById('board');
const moveList = document.getElementById('moves');
const cells = Array.from(boardEl.querySelectorAll('.cell'));
const swapButton = document.getElementById('swapPlayers');

const player1NameInput = form.querySelector('input[name="player1Name"]');
const player1PortInput = form.querySelector('input[name="player1Port"]');
const player2NameInput = form.querySelector('input[name="player2Name"]');
const player2PortInput = form.querySelector('input[name="player2Port"]');

const SYMBOLS = {
  0: '',
  1: 'X',
  2: 'O'
};

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function resetBoard() {
  cells.forEach((cell) => {
    cell.dataset.symbol = '';
    cell.classList.remove('winner');
  });
}

function updateBoard(boardState) {
  boardState.forEach((value, index) => {
    const cell = cells[index];
    cell.dataset.symbol = SYMBOLS[value] || '';
  });
}

function highlightWinningCells(winningLine) {
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
  statusEl.classList.toggle('error', isError);
}

function parsePort(value) {
  const port = Number.parseInt(value, 10);
  return Number.isInteger(port) ? port : Number.NaN;
}

function swapPlayers() {
  const name1 = player1NameInput.value;
  const port1 = player1PortInput.value;

  player1NameInput.value = player2NameInput.value;
  player1PortInput.value = player2PortInput.value;
  player2NameInput.value = name1;
  player2PortInput.value = port1;
}

async function animateHistory(history, winningLine) {
  resetBoard();
  moveList.innerHTML = '';

  for (const step of history) {
    const entry = document.createElement('li');

    if (step.error) {
      entry.classList.add('error');
      const strong = document.createElement('strong');
      strong.textContent = step.playerName;
      entry.appendChild(strong);
      entry.append(`: ${step.error}`);
    } else {
      entry.textContent = `Turno ${step.turn}: ${step.playerName} jugo en la casilla ${step.move + 1}.`;
    }

    moveList.appendChild(entry);

    const boardState = step.boardAfter || step.boardBefore;

    if (boardState) {
      await delay(700);
      updateBoard(boardState);
    }

    if (step.error) {
      break;
    }
  }

  highlightWinningCells(winningLine);
}

if (swapButton) {
  swapButton.addEventListener('click', swapPlayers);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  if (swapButton) {
    swapButton.disabled = true;
  }

  setStatus('Iniciando partida...');
  resetBoard();
  moveList.innerHTML = '';

  const formData = new FormData(form);

  const payload = {
    player1: {
      name: formData.get('player1Name'),
      port: parsePort(formData.get('player1Port'))
    },
    player2: {
      name: formData.get('player2Name'),
      port: parsePort(formData.get('player2Port'))
    }
  };

  const portsAreValid =
    Number.isInteger(payload.player1.port) &&
    payload.player1.port > 0 &&
    Number.isInteger(payload.player2.port) &&
    payload.player2.port > 0;

  if (!portsAreValid) {
    setStatus('Ingresa puertos validos para ambos jugadores.', true);
    submitButton.disabled = false;
    if (swapButton) {
      swapButton.disabled = false;
    }
    return;
  }

  try {
    const response = await fetch('/api/match', {
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

    await animateHistory(data.history, data.winningLine);

    const isError = data.result === 'error';
    const winnerName = data.winner ? data.winner.name : null;

    if (data.result === 'win' && winnerName) {
      setStatus(`${data.message} (${winnerName})`, false);
    } else {
      setStatus(data.message, isError);
    }
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
    if (swapButton) {
      swapButton.disabled = false;
    }
  }
});
