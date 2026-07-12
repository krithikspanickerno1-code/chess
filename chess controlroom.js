// viking-chess.js
// Complete in-memory chess implementation (pure JavaScript).
// Features:
// - Full move rules: en passant, castling, promotion (UI), legal move filtering
// - End conditions: checkmate, stalemate, 50-move rule, threefold repetition,
//   insufficient material, draw by agreement, resignation
// - Position logging for threefold repetition (includes castling & en passant)
// - Half-move clock for 50-move rule
// - No visual en-passant indicator

(function () {
  // --- DOM setup (create canvas and controls dynamically) ---
  const body = document.body;
  body.style.margin = "0";
  body.style.fontFamily = "Arial, Helvetica, sans-serif";
  body.style.background = "#222";
  body.style.color = "#eee";
  body.style.display = "flex";
  body.style.gap = "20px";
  body.style.alignItems = "flex-start";
  body.style.padding = "24px";

  const boardWrap = document.createElement("div");
  boardWrap.id = "board-wrap";
  boardWrap.style.position = "relative";
  body.appendChild(boardWrap);

  const canvas = document.createElement("canvas");
  canvas.id = "chessboard";
  canvas.width = 480;
  canvas.height = 480;
  canvas.style.background = "#fff";
  canvas.style.borderRadius = "8px";
  canvas.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";
  boardWrap.appendChild(canvas);

  const controls = document.createElement("div");
  controls.id = "controls";
  controls.style.display = "flex";
  controls.style.flexDirection = "column";
  controls.style.gap = "8px";
  body.appendChild(controls);

  const offerDrawBtn = document.createElement("button");
  offerDrawBtn.id = "offer-draw";
  offerDrawBtn.textContent = "Offer Draw";
  styleControlButton(offerDrawBtn);
  controls.appendChild(offerDrawBtn);

  const resignBtn = document.createElement("button");
  resignBtn.id = "resign";
  resignBtn.textContent = "Resign";
  styleControlButton(resignBtn);
  controls.appendChild(resignBtn);

  const resetBtn = document.createElement("button");
  resetBtn.id = "reset";
  resetBtn.textContent = "Reset Game";
  styleControlButton(resetBtn);
  controls.appendChild(resetBtn);

  const statusEl = document.createElement("div");
  statusEl.id = "status";
  statusEl.style.marginTop = "8px";
  statusEl.style.fontSize = "13px";
  statusEl.style.color = "#ddd";
  statusEl.textContent = "Ready.";
  controls.appendChild(statusEl);

  function styleControlButton(btn) {
    btn.style.padding = "8px 12px";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.style.borderRadius = "6px";
    btn.style.border = "0";
    btn.style.background = "#444";
    btn.style.color = "#fff";
  }

  // --- Canvas context ---
  const ctx = canvas.getContext("2d");

  const SIZE = 60;
  const boardSize = 8;

  const unicodePieces = {
    'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
    'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
  };

  // --- Game state ---
  let board = [
    ['r','n','b','q','k','b','n','r'],
    ['p','p','p','p','p','p','p','p'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['P','P','P','P','P','P','P','P'],
    ['R','N','B','Q','K','B','N','R']
  ];

  let selected = null;
  let legalMoves = [];
  let whiteTurn = true;
  let enPassantTarget = null; // {row, col} or null
  let gameOver = false;

  // Castling rights
  let castlingRights = {
    wK: true, wQ: true, bK: true, bQ: true
  };

  // 50-move rule (half-moves)
  let halfMoveClock = 0;

  // Threefold repetition log
  let positionLog = new Map();
  function createControls() {
  const controls = document.createElement("div");
  controls.className = "controls";

  // Existing buttons you already had
  const resetBtn = document.createElement("button");
  resetBtn.textContent = "Reset";
  resetBtn.addEventListener("click", resetBoard);
  controls.appendChild(resetBtn);

  const drawBtn = document.createElement("button");
  drawBtn.textContent = "Offer Draw";
  drawBtn.addEventListener("click", offerDraw);
  controls.appendChild(drawBtn);

  // NEW: explicit resign buttons
  const whiteResignBtn = document.createElement("button");
  whiteResignBtn.textContent = "Resign (White)";
  whiteResignBtn.addEventListener("click", () => endGame("Black", "White resigns"));
  controls.appendChild(whiteResignBtn);

  const blackResignBtn = document.createElement("button");
  blackResignBtn.textContent = "Resign (Black)";
  blackResignBtn.addEventListener("click", () => endGame("White", "Black resigns"));
  controls.appendChild(blackResignBtn);

  document.body.appendChild(controls);
}

    const whiteResignBtn = document.createElement("button");
    whiteResignBtn.textContent = "Resign (White)";
    whiteResignBtn.addEventListener("click", () => endGame("Black", "White resigns"));
    controls.appendChild(whiteResignBtn);

    const blackResignBtn = document.createElement("button");
    blackResignBtn.textContent = "Resign (Black)";
    blackResignBtn.addEventListener("click", () => endGame("White", "Black resigns"));
    controls.appendChild(blackResignBtn);

function endGame(winner, reason) {
    state.gameOver = true;
    state.winner = winner;
    state.reason = reason;
    renderBoard();
    updateStatus();
}

  // Capture flag
  let captureFlag = false;

  // --- Drawing (no en-passant dot) ---
  function drawBoard() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        ctx.fillStyle = (row + col) % 2 === 0 ? "#f0d9b5" : "#b58863";
        ctx.fillRect(col * SIZE, row * SIZE, SIZE, SIZE);

        // selected square
        if (selected && selected.row === row && selected.col === col) {
          ctx.strokeStyle = "yellow";
          ctx.lineWidth = 3;
          ctx.strokeRect(col * SIZE + 2, row * SIZE + 2, SIZE - 4, SIZE - 4);
        }

        // legal move highlight
        if (legalMoves.some(m => m.row === row && m.col === col)) {
          ctx.strokeStyle = "limegreen";
          ctx.lineWidth = 3;
          ctx.strokeRect(col * SIZE + 2, row * SIZE + 2, SIZE - 4, SIZE - 4);
        }
      }
    }
  }

  function drawPieces() {
    ctx.font = "40px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    for (let row = 0; row < boardSize; row++) {
      for (let col = 0; col < boardSize; col++) {
        let piece = board[row][col];
        if (piece) {
          ctx.fillStyle = "#222";
          ctx.fillText(unicodePieces[piece], col * SIZE + SIZE/2, row * SIZE + SIZE/2);
        }
      }
    }

    // HUD
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.font = "12px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Half-move clock: ${halfMoveClock}`, 6, canvas.height - 6);
    ctx.textAlign = "right";
    ctx.fillText(whiteTurn ? "White to move" : "Black to move", canvas.width - 6, canvas.height - 6);
  }

  function render() {
    drawBoard();
    drawPieces();
    updateStatus();
  }

  // --- Overlays and UI helpers ---
  function showPromotionMenuAt(isWhite, squareRow, squareCol, onChoose) {
    const existing = document.getElementById("promotion-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "promotion-overlay";
    overlay.style.position = "absolute";
    overlay.style.display = "flex";
    overlay.style.gap = "6px";
    overlay.style.background = "#fff";
    overlay.style.border = "2px solid #333";
    overlay.style.padding = "6px";
    overlay.style.borderRadius = "6px";
    overlay.style.boxShadow = "0 4px 12px rgba(0,0,0,0.25)";
    overlay.style.zIndex = 10000;

    const options = ['q','r','b','n'];
    options.forEach(opt => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.style.fontSize = "28px";
      btn.style.padding = "6px 8px";
      btn.style.cursor = "pointer";
      btn.style.background = "transparent";
      btn.style.border = "none";
      btn.style.outline = "none";
      btn.textContent = unicodePieces[isWhite ? opt.toUpperCase() : opt];
      btn.onclick = () => {
        overlay.remove();
        onChoose(opt);
      };
      overlay.appendChild(btn);
    });

    document.body.appendChild(overlay);

    const rect = canvas.getBoundingClientRect();
    const squareLeft = rect.left + squareCol * SIZE;
    const squareTop = rect.top + squareRow * SIZE;

    overlay.style.left = "0px";
    overlay.style.top = "0px";
    const overlayRect = overlay.getBoundingClientRect();

    let left = squareLeft + SIZE/2 - overlayRect.width / 2;
    let top = squareTop - overlayRect.height - 8;

    if (top < 0) top = squareTop + SIZE + 8;
    left = Math.max(8, Math.min(left, window.innerWidth - overlayRect.width - 8));

    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
  }

  function showGameOverOverlay(message) {
    const existing = document.getElementById("gameover-overlay");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "gameover-overlay";
    overlay.style.position = "absolute";
    overlay.style.left = "50%";
    overlay.style.top = "50%";
    overlay.style.transform = "translate(-50%, -50%)";
    overlay.style.background = "rgba(20,20,20,0.95)";
    overlay.style.color = "#fff";
    overlay.style.padding = "20px 28px";
    overlay.style.borderRadius = "10px";
    overlay.style.textAlign = "center";
    overlay.style.zIndex = 20000;
    overlay.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";
    overlay.style.fontFamily = "Arial, sans-serif";

    const title = document.createElement("div");
    title.style.fontSize = "22px";
    title.style.fontWeight = "700";
    title.style.marginBottom = "8px";
    title.textContent = message;

    const sub = document.createElement("div");
    sub.style.fontSize = "13px";
    sub.style.opacity = "0.95";
    sub.style.marginBottom = "12px";
    sub.textContent = "Refresh the page or press Reset to start a new battle.";

    const btn = document.createElement("button");
    btn.textContent = "Close";
    btn.style.padding = "8px 12px";
    btn.style.fontSize = "14px";
    btn.style.cursor = "pointer";
    btn.onclick = () => overlay.remove();

    overlay.appendChild(title);
    overlay.appendChild(sub);
    overlay.appendChild(btn);

    document.body.appendChild(overlay);
  }

  // --- Utilities ---
  function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function isWhitePieceChar(ch) { return ch && ch === ch.toUpperCase(); }
  function isEnemy(piece, isWhite) {
    if (!piece) return false;
    return (isWhite && piece === piece.toLowerCase()) || (!isWhite && piece === piece.toUpperCase());
  }

  // --- Move generation helpers ---
  function slideMoves(boardState, row, col, isWhite, directions) {
    const moves = [];
    for (let [dr, dc] of directions) {
      let r = row + dr, c = col + dc;
      while (inBounds(r,c)) {
        if (!boardState[r][c]) {
          moves.push({row: r, col: c});
        } else {
          if (isEnemy(boardState[r][c], isWhite)) moves.push({row: r, col: c});
          break;
        }
        r += dr; c += dc;
      }
    }
    return moves;
  }

  function getPawnMoves(boardState, row, col, isWhite) {
    const moves = [];
    const dir = isWhite ? -1 : 1;

    if (inBounds(row + dir, col) && !boardState[row + dir][col]) {
      moves.push({row: row + dir, col});
      if ((isWhite && row === 6) || (!isWhite && row === 1)) {
        if (!boardState[row + 2*dir][col]) moves.push({row: row + 2*dir, col});
      }
    }

    for (let dc of [-1, 1]) {
      const r = row + dir, c = col + dc;
      if (inBounds(r, c)) {
        if (boardState[r][c] && isEnemy(boardState[r][c], isWhite)) moves.push({row: r, col: c});
        if (enPassantTarget && enPassantTarget.row === r && enPassantTarget.col === c) {
          moves.push({row: r, col: c, enPassant: true});
        }
      }
    }
    return moves;
  }

  function getRookMoves(boardState, row, col, isWhite) {
    return slideMoves(boardState, row, col, isWhite, [[1,0],[-1,0],[0,1],[0,-1]]);
  }

  function getKnightMoves(boardState, row, col, isWhite) {
    const moves = [];
    const jumps = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
    for (let [dr, dc] of jumps) {
      const r = row + dr, c = col + dc;
      if (inBounds(r,c)) {
        if (!boardState[r][c] || isEnemy(boardState[r][c], isWhite)) moves.push({row: r, col: c});
      }
    }
    return moves;
  }

  function getBishopMoves(boardState, row, col, isWhite) {
    return slideMoves(boardState, row, col, isWhite, [[1,1],[1,-1],[-1,1],[-1,-1]]);
  }

  function getQueenMoves(boardState, row, col, isWhite) {
    return slideMoves(boardState, row, col, isWhite,
      [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
  }

  function squareIsAttacked(boardState, targetRow, targetCol, byWhite) {
    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const piece = boardState[r][c];
        if (!piece) continue;
        const pieceIsWhite = piece === piece.toUpperCase();
        if (pieceIsWhite !== byWhite) continue;
        const moves = getMovesForPiece(boardState, r, c);
        if (moves.some(m => m.row === targetRow && m.col === targetCol)) return true;
      }
    }
    return false;
  }

  function getKingMoves(boardState, row, col, isWhite) {
    const moves = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    for (let [dr, dc] of dirs) {
      const r = row + dr, c = col + dc;
      if (inBounds(r,c)) {
        if (!boardState[r][c] || isEnemy(boardState[r][c], isWhite)) moves.push({row: r, col: c});
      }
    }

    // Castling checks
    if (isWhite) {
      if (row === 7 && col === 4) {
        if (castlingRights.wK &&
            !boardState[7][5] && !boardState[7][6] &&
            !squareIsAttacked(boardState, 7,4, false) &&
            !squareIsAttacked(boardState, 7,5, false) &&
            !squareIsAttacked(boardState, 7,6, false)) {
          moves.push({row:7, col:6, castle: 'K'});
        }
        if (castlingRights.wQ &&
            !boardState[7][3] && !boardState[7][2] && !boardState[7][1] &&
            !squareIsAttacked(boardState, 7,4, false) &&
            !squareIsAttacked(boardState, 7,3, false) &&
            !squareIsAttacked(boardState, 7,2, false)) {
          moves.push({row:7, col:2, castle: 'Q'});
        }
      }
    } else {
      if (row === 0 && col === 4) {
        if (castlingRights.bK &&
            !boardState[0][5] && !boardState[0][6] &&
            !squareIsAttacked(boardState, 0,4, true) &&
            !squareIsAttacked(boardState, 0,5, true) &&
            !squareIsAttacked(boardState, 0,6, true)) {
          moves.push({row:0, col:6, castle: 'K'});
        }
        if (castlingRights.bQ &&
            !boardState[0][3] && !boardState[0][2] && !boardState[0][1] &&
            !squareIsAttacked(boardState, 0,4, true) &&
            !squareIsAttacked(boardState, 0,3, true) &&
            !squareIsAttacked(boardState, 0,2, true)) {
          moves.push({row:0, col:2, castle: 'Q'});
        }
      }
    }

    return moves;
  }

  function getMovesForPiece(boardState, row, col) {
    const piece = boardState[row][col];
    if (!piece) return [];
    const isWhite = piece === piece.toUpperCase();
    switch(piece.toLowerCase()) {
      case 'p': return getPawnMoves(boardState, row, col, isWhite);
      case 'r': return getRookMoves(boardState, row, col, isWhite);
      case 'n': return getKnightMoves(boardState, row, col, isWhite);
      case 'b': return getBishopMoves(boardState, row, col, isWhite);
      case 'q': return getQueenMoves(boardState, row, col, isWhite);
      case 'k': return getKingMoves(boardState, row, col, isWhite);
    }
    return [];
  }

  // --- Check logic ---
  function findKing(boardState, isWhite) {
    const kingChar = isWhite ? 'K' : 'k';
    for (let r=0; r<8; r++) for (let c=0; c<8; c++) if (boardState[r][c] === kingChar) return {row:r, col:c};
    return null;
  }

  function isKingInCheck(boardState, isWhite) {
    const kingPos = findKing(boardState, isWhite);
    if (!kingPos) return false;
    return squareIsAttacked(boardState, kingPos.row, kingPos.col, !isWhite);
  }

  // --- Simulation ---
  function cloneBoard(boardState) { return boardState.map(r => r.slice()); }

  function simulateMove(boardState, from, to, currentEnPassant, currentCastling) {
    const newBoard = cloneBoard(boardState);
    const piece = newBoard[from.row][from.col];
    newBoard[to.row][to.col] = piece;
    newBoard[from.row][from.col] = '';

    const newCastling = Object.assign({}, currentCastling);
    let newEnPassant = null;

    if (to.enPassant) newBoard[from.row][to.col] = '';

    if (to.castle) {
      if (piece === 'K') {
        if (to.castle === 'K') { newBoard[7][5] = newBoard[7][7]; newBoard[7][7] = ''; }
        else { newBoard[7][3] = newBoard[7][0]; newBoard[7][0] = ''; }
      } else if (piece === 'k') {
        if (to.castle === 'K') { newBoard[0][5] = newBoard[0][7]; newBoard[0][7] = ''; }
        else { newBoard[0][3] = newBoard[0][0]; newBoard[0][0] = ''; }
      }
    }

    if (piece === 'K') { newCastling.wK = false; newCastling.wQ = false; }
    else if (piece === 'k') { newCastling.bK = false; newCastling.bQ = false; }

    if (from.row === 7 && from.col === 7) newCastling.wK = false;
    if (from.row === 7 && from.col === 0) newCastling.wQ = false;
    if (from.row === 0 && from.col === 7) newCastling.bK = false;
    if (from.row === 0 && from.col === 0) newCastling.bQ = false;

    const capturedAt = (to.enPassant ? {row: from.row, col: to.col} : {row: to.row, col: to.col});
    if (capturedAt.row === 7 && capturedAt.col === 7) newCastling.wK = false;
    if (capturedAt.row === 7 && capturedAt.col === 0) newCastling.wQ = false;
    if (capturedAt.row === 0 && capturedAt.col === 7) newCastling.bK = false;
    if (capturedAt.row === 0 && capturedAt.col === 0) newCastling.bQ = false;

    if (piece && piece.toLowerCase() === 'p' && Math.abs(to.row - from.row) === 2) {
      newEnPassant = { row: (from.row + to.row) / 2, col: from.col };
    } else newEnPassant = null;

    return { board: newBoard, castling: newCastling, enPassant: newEnPassant };
  }

  // --- Legal move filtering ---
  function getLegalMoves(boardState, row, col, currentEnPassant, currentCastling) {
    const piece = boardState[row][col];
    if (!piece) return [];
    const isWhite = piece === piece.toUpperCase();
    const moves = getMovesForPiece(boardState, row, col);

    return moves.filter(move => {
      const sim = simulateMove(boardState, {row, col}, move, currentEnPassant, currentCastling);
      return !isKingInCheck(sim.board, isWhite);
    });
  }

  function hasAnyLegalMoves(boardState, isWhite, currentEnPassant, currentCastling) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardState[r][c];
        if (piece && (piece === piece.toUpperCase()) === isWhite) {
          const moves = getLegalMoves(boardState, r, c, currentEnPassant, currentCastling);
          if (moves.length > 0) return true;
        }
      }
    }
    return false;
  }

  // --- Position key for threefold repetition ---
  function getPositionKey(boardState, sideToMove, enPassant, castling) {
    let key = boardState.map(row => row.map(cell => cell || '.').join("")).join("/");
    key += sideToMove ? " w" : " b";
    let cr = "";
    if (castling.wK) cr += "K";
    if (castling.wQ) cr += "Q";
    if (castling.bK) cr += "k";
    if (castling.bQ) cr += "q";
    if (cr === "") cr = "-";
    key += ` ${cr}`;
    if (enPassant) key += ` ep${enPassant.row}${enPassant.col}`; else key += " ep-";
    return key;
  }

  function updatePositionLog() {
    const key = getPositionKey(board, whiteTurn, enPassantTarget, castlingRights);
    const prev = positionLog.get(key) || 0;
    const now = prev + 1;
    positionLog.set(key, now);
    if (now >= 3) {
      gameOver = true;
      showGameOverOverlay("Draw by threefold repetition!");
      positionLog.clear();
    }
  }

  // --- Insufficient material detection ---
  function hasInsufficientMaterial(boardState) {
    let whitePieces = [];
    let blackPieces = [];
    let whiteBishopsSquares = [];
    let blackBishopsSquares = [];

    for (let r=0; r<8; r++) {
      for (let c=0; c<8; c++) {
        const p = boardState[r][c];
        if (!p) continue;
        const isWhite = p === p.toUpperCase();
        const lower = p.toLowerCase();
        if (isWhite) whitePieces.push(lower); else blackPieces.push(lower);
        if (lower === 'b') {
          const color = (r + c) % 2 === 0 ? 'light' : 'dark';
          if (isWhite) whiteBishopsSquares.push(color); else blackBishopsSquares.push(color);
        }
      }
    }

    // Only kings
    if (whitePieces.length === 1 && blackPieces.length === 1) return true;

    // King + single minor piece vs King
    if ((whitePieces.length === 2 && whitePieces.includes('k') && (whitePieces.includes('n') || whitePieces.includes('b')) && blackPieces.length === 1) ||
        (blackPieces.length === 2 && blackPieces.includes('k') && (blackPieces.includes('n') || blackPieces.includes('b')) && whitePieces.length === 1)) {
      return true;
    }

    // King + bishop vs King + bishop where both bishops are on same color
    if (whitePieces.length === 2 && blackPieces.length === 2 &&
        whitePieces.includes('k') && whitePieces.includes('b') &&
        blackPieces.includes('k') && blackPieces.includes('b')) {
      if (whiteBishopsSquares.length === 1 && blackBishopsSquares.length === 1 &&
          whiteBishopsSquares[0] === blackBishopsSquares[0]) return true;
    }

    return false;
  }

  // --- Game over checks ---
  function checkGameOver() {
    if (gameOver) return;

    if (hasInsufficientMaterial(board)) {
      gameOver = true;
      showGameOverOverlay("Draw by insufficient material! No checkmate possible.");
      positionLog.clear();
      return;
    }

    const isWhite = whiteTurn;
    const inCheck = isKingInCheck(board, isWhite);
    const hasMoves = hasAnyLegalMoves(board, isWhite, enPassantTarget, castlingRights);

    if (!hasMoves) {
      gameOver = true;
      if (inCheck) showGameOverOverlay((isWhite ? "White" : "Black") + " is checkmated! Viking death of the king!");
      else showGameOverOverlay("Stalemate! The battle ends in a draw.");
      positionLog.clear();
      return;
    }

    if (halfMoveClock >= 100) {
      gameOver = true;
      showGameOverOverlay("Draw by 50-move rule! No pawn pushes or captures.");
      positionLog.clear();
      return;
    }
  }

  // --- Make move (applies to real board) ---
  function makeMove(from, to) {
    if (gameOver) return;
    const piece = board[from.row][from.col];
    if (!piece) return;

    const isCapture = !!board[to.row][to.col] || !!to.enPassant;
    captureFlag = isCapture;

    if (to.enPassant) board[from.row][to.col] = '';

    if (to.castle) {
      if (piece === 'K') {
        if (to.castle === 'K') { board[7][5] = board[7][7]; board[7][7] = ''; }
        else { board[7][3] = board[7][0]; board[7][0] = ''; }
      } else if (piece === 'k') {
        if (to.castle === 'K') { board[0][5] = board[0][7]; board[0][7] = ''; }
        else { board[0][3] = board[0][0]; board[0][0] = ''; }
      }
    }

    board[to.row][to.col] = piece;
    board[from.row][from.col] = '';

    if (piece === 'K') { castlingRights.wK = false; castlingRights.wQ = false; }
    else if (piece === 'k') { castlingRights.bK = false; castlingRights.bQ = false; }

    if (from.row === 7 && from.col === 7) castlingRights.wK = false;
    if (from.row === 7 && from.col === 0) castlingRights.wQ = false;
    if (from.row === 0 && from.col === 7) castlingRights.bK = false;
    if (from.row === 0 && from.col === 0) castlingRights.bQ = false;

    const capturedAt = (to.enPassant ? {row: from.row, col: to.col} : {row: to.row, col: to.col});
    if (capturedAt.row === 7 && capturedAt.col === 7) castlingRights.wK = false;
    if (capturedAt.row === 7 && capturedAt.col === 0) castlingRights.wQ = false;
    if (capturedAt.row === 0 && capturedAt.col === 7) castlingRights.bK = false;
    if (capturedAt.row === 0 && capturedAt.col === 0) castlingRights.bQ = false;

    // Promotion
    if ((piece === 'P' && to.row === 0) || (piece === 'p' && to.row === 7)) {
      showPromotionMenuAt(piece === 'P', to.row, to.col, (choice) => {
        switch(choice) {
          case 'r': board[to.row][to.col] = piece === 'P' ? 'R' : 'r'; break;
          case 'b': board[to.row][to.col] = piece === 'P' ? 'B' : 'b'; break;
          case 'n': board[to.row][to.col] = piece === 'P' ? 'N' : 'n'; break;
          default:  board[to.row][to.col] = piece === 'P' ? 'Q' : 'q'; break;
        }
        halfMoveClock = 0;
        enPassantTarget = null;
        whiteTurn = !whiteTurn;
        updatePositionLog();
        render();
        checkGameOver();
      });
      return;
    }

    if (piece.toLowerCase() === 'p' && Math.abs(to.row - from.row) === 2) {
      enPassantTarget = { row: (from.row + to.row) / 2, col: from.col };
    } else enPassantTarget = null;

    if (piece.toLowerCase() === 'p' || isCapture) halfMoveClock = 0; else halfMoveClock++;

    whiteTurn = !whiteTurn;

    updatePositionLog();
    render();
    checkGameOver();
  }

  // --- Interaction ---
  
  canvas.addEventListener("click", (e) => {
    if (gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / SIZE);
    const row = Math.floor(y / SIZE);
    if (!inBounds(row, col)) return;

    const piece = board[row][col];
    const isWhitePiece = piece && piece === piece.toUpperCase();

    if (!selected) {
      if (piece && isWhitePiece === whiteTurn) {
        selected = { row, col };
        legalMoves = getLegalMoves(board, row, col, enPassantTarget, castlingRights);
      }
    } else {
      const move = legalMoves.find(m => m.row === row && m.col === col);
      if (move) {
        makeMove(selected, move);
        selected = null;
        legalMoves = [];
      } else if (piece && isWhitePiece === whiteTurn) {
        selected = { row, col };
        legalMoves = getLegalMoves(board, row, col, enPassantTarget, castlingRights);
      } else {
        selected = null;
        legalMoves = [];
      }
    }
    render();
  });

  // --- Controls ---
  function updateStatus() {
    if (gameOver) statusEl.textContent = "Game over.";
    else statusEl.textContent = `${whiteTurn ? "White" : "Black"} to move. Half-move clock: ${halfMoveClock}.`;
  }

  offerDrawBtn.addEventListener("click", () => {
    if (gameOver) return;
    const offering = whiteTurn ? "White" : "Black";
    const opponent = whiteTurn ? "Black" : "White";
    const accept = confirm(`${offering} offers a draw. ${opponent}, do you accept the draw?`);
    if (accept) {
      gameOver = true;
      showGameOverOverlay("Draw by agreement! Both sides lay down arms.");
      positionLog.clear();
    } else {
      alert("Draw offer declined.");
    }
  });

  resignBtn.addEventListener("click", () => {
    if (gameOver) return;
    const resigning = whiteTurn ? "White" : "Black";
    const winner = whiteTurn ? "Black" : "White";
    const ok = confirm(`${resigning} will resign. Confirm resignation?`);
    if (!ok) return;
    gameOver = true;
    showGameOverOverlay(`${resigning} resigns! ${winner} wins.`);
    positionLog.clear();
  });

  resetBtn.addEventListener("click", () => resetGame());

  // --- Initialization helpers ---
  function startPositionLog() {
    positionLog.clear();
    const key = getPositionKey(board, whiteTurn, enPassantTarget, castlingRights);
    positionLog.set(key, 1);
  }

  function resetGame() {
    board = [
      ['r','n','b','q','k','b','n','r'],
      ['p','p','p','p','p','p','p','p'],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['','','','','','','',''],
      ['P','P','P','P','P','P','P','P'],
      ['R','N','B','Q','K','B','N','R']
    ];
    selected = null;
    legalMoves = [];
    whiteTurn = true;
    enPassantTarget = null;
    gameOver = false;
    castlingRights = { wK:true, wQ:true, bK:true, bQ:true };
    halfMoveClock = 0;
    captureFlag = false;
    positionLog.clear();
    startPositionLog();
    render();
    const existing = document.getElementById("gameover-overlay");
    if (existing) existing.remove();
    const promo = document.getElementById("promotion-overlay");
    if (promo) promo.remove();
  }

  // Start
  startPositionLog();
  render();
})();
