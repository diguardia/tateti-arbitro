const path = require('path');
const express = require('express');
const { runMatch } = require('./src/arbitrator');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/match', async (req, res) => {
  const { player1, player2, timeoutMs } = req.body || {};

  if (!player1 || !player2) {
    return res.status(400).json({ error: 'Se necesitan dos jugadores para iniciar la partida.' });
  }

  try {
    const result = await runMatch([player1, player2], { timeoutMs });
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
