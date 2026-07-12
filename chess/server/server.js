const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

// Path to JSON storage file
const STORAGE_FILE = path.join(__dirname, 'serverstorage.json');

// Load initial state from JSON
let state = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));

// GET current state
app.get('/state', (req, res) => {
  res.json(state);
});

// POST a move
app.post('/move', (req, res) => {
  const { from, to } = req.body;

  // Defensive checks
  if (!from || !to) {
    return res.status(400).json({ ok: false, message: "Invalid move data" });
  }

  const piece = state.board[from.row][from.col];
  if (piece) {
    // Move piece
    state.board[to.row][to.col] = piece;
    state.board[from.row][from.col] = '';

    // Toggle turn
    state.whiteTurn = !state.whiteTurn;

    // Save to JSON file
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2));

    console.log(`Move applied: ${piece} ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    return res.json({ ok: true, state });
  } else {
    console.log(`Invalid move: no piece at ${JSON.stringify(from)}`);
    return res.status(400).json({ ok: false, message: "No piece at source square" });
  }
});

// Reset game
app.post('/reset', (req, res) => {
  state = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
  console.log('Game reset');
  res.json({ ok: true, state });
});

// Draw
app.post('/draw', (req, res) => {
  state.gameOver = true;
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2));
  console.log('Game ended in draw');
  res.json({ ok: true, message: 'Game ended in draw', state });
});

// Resign
app.post('/resign', (req, res) => {
  const { side } = req.body;
  state.gameOver = true;
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2));
  console.log(`${side} resigned`);
  res.json({ ok: true, message: `${side} resigned`, state });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
