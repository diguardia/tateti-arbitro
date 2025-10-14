const path = require('path');
const express = require('express');
const { runMatch, runTournament, requestBotMove } = require('./src/arbitrator');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/match', async (req, res) => {
  const { player1, player2, timeoutMs, boardSize, winLength, matchType } = req.body || {};

  if (!player1 || !player2) {
    return res.status(400).json({ error: 'Se necesitan dos jugadores para iniciar la partida.' });
  }

  if (matchType && matchType !== 'bot-vs-bot') {
    return res.status(400).json({ error: 'Este endpoint solo admite partidas entre bots.' });
  }

  try {
    const result = await runMatch([player1, player2], { timeoutMs, boardSize, winLength });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/bot-move', async (req, res) => {
  const { player, board, playerId, timeoutMs, boardSize, winLength } = req.body || {};

  if (!player) {
    return res.status(400).json({ error: 'Falta la configuracion del bot.' });
  }

  try {
    const moveResponse = await requestBotMove(player, board, {
      playerId,
      timeoutMs,
      boardSize,
      winLength
    });

    if (moveResponse.error) {
      return res.status(400).json({ error: moveResponse.error });
    }

    return res.json({ move: moveResponse.move });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/tournament', async (req, res) => {
  const { player1, player2, timeoutMs, boardSize, winLength } = req.body || {};

  if (!player1 || !player2) {
    return res.status(400).json({ error: 'Se necesitan dos jugadores para iniciar el torneo.' });
  }

  try {
    const result = await runTournament([player1, player2], { timeoutMs, boardSize, winLength });
    return res.json(result);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado.' });
});

app.listen(PORT, () => {
  console.log(`Servidor de arbitraje escuchando en el puerto ${PORT}`);
});
