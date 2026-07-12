/* chesscontrolroom_black.js
   Full Black client program
   - Flipped board rendering for Black perspective
   - Click mapping reversed so Black clicks correspond to correct board squares
   - Only allows Black to move when whiteTurn === false
   - Syncs with server at SERVER_BASE (default http://localhost:3000)
   - Includes promotion UI, castling, en-passant, basic move legality filtering
*/

/* CONFIG */
const SERVER_BASE = "http://localhost:3000"; // change when deploying
const POLL_INTERVAL_MS = 1000;

/* UI & Canvas */
const canvas = document.getElementById("chessboard");
const ctx = canvas.getContext("2d");
const SIZE = 60;
const boardSize = 8;
const statusEl = document.getElementById("status");

const unicodePieces = {
  'P': '♙', 'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔',
  'p': '♟', 'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚'
};

/* Local game state (keeps a copy of server state) */
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
let enPassantTarget = null;
let gameOver = false;
let castlingRights = { wK:true, wQ:true, bK:true, bQ:true };
let halfMoveClock = 0;
let positionLog = new Map();
let captureFlag = false;

/* Coordinate helpers for Black perspective
   Display coordinates (dRow,dCol) are what the user sees (0..7 top-left).
   For Black client we render flipped: display (0,0) corresponds to board (7,7).
   Conversion functions map between display and board coordinates.
*/
function boardToDisplay(row, col) {
  // board indices -> display indices for black perspective
  return { dRow: 7 - row, dCol: 7 - col };
}
function displayToBoard(dRow, dCol) {
  // display indices -> board indices
  return { row: 7 - dRow, col: 7 - dCol };
}

/* Drawing (flipped) */
function drawBoard() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for (let dRow = 0; dRow < boardSize; dRow++) {
    for (let dCol = 0; dCol < boardSize; dCol++) {
      const color = (dRow + dCol) % 2 === 0 ? "#f0d9b5" : "#b58863";
      ctx.fillStyle = color;
      ctx.fillRect(dCol * SIZE, dRow * SIZE, SIZE, SIZE);

      // highlight selected square (convert selected board -> display)
      if (selected) {
        const selDisp = boardToDisplay(selected.row, selected.col);
        if (selDisp.dRow === dRow && selDisp.dCol === dCol) {
          ctx.strokeStyle = "yellow";
          ctx.lineWidth = 3;
          ctx.strokeRect(dCol * SIZE + 2, dRow * SIZE + 2, SIZE - 4, SIZE - 4);
        }
      }

      // highlight legal moves (convert each legal move board -> display)
      if (legalMoves.some(m => {
        const md = boardToDisplay(m.row, m.col);
        return md.dRow === dRow && md.dCol === dCol;
      })) {
        ctx.strokeStyle = "limegreen";
        ctx.lineWidth = 3;
        ctx.strokeRect(dCol * SIZE + 2, dRow * SIZE + 2, SIZE - 4, SIZE - 4);
      }
    }
  }
}

function drawPieces() {
  ctx.font = "40px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      const piece = board[r][c];
      if (piece) {
        const disp = boardToDisplay(r, c);
        ctx.fillStyle = "#222";
        ctx.fillText(unicodePieces[piece], disp.dCol * SIZE + SIZE/2, disp.dRow * SIZE + SIZE/2);
      }
    }
  }

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

/* Utilities */
function inBounds(r,c){ return r>=0 && r<8 && c>=0 && c<8; }
function isEnemy(piece, isWhite){ if(!piece) return false; return (isWhite && piece===piece.toLowerCase()) || (!isWhite && piece===piece.toUpperCase()); }
function cloneBoard(b){ return b.map(r => r.slice()); }

/* Move generation (same logic as White client) */
function slideMoves(boardState, row, col, isWhite, directions){
  const moves=[];
  for (let [dr,dc] of directions){
    let r=row+dr, c=col+dc;
    while(inBounds(r,c)){
      if(!boardState[r][c]) moves.push({row:r,col:c});
      else { if(isEnemy(boardState[r][c], isWhite)) moves.push({row:r,col:c}); break; }
      r+=dr; c+=dc;
    }
  }
  return moves;
}

function getPawnMoves(boardState,row,col,isWhite){
  const moves=[]; const dir = isWhite ? -1 : 1;
  if(inBounds(row+dir,col) && !boardState[row+dir][col]){
    moves.push({row:row+dir,col});
    if((isWhite && row===6) || (!isWhite && row===1)){
      if(!boardState[row+2*dir][col]) moves.push({row:row+2*dir,col});
    }
  }
  for(let dc of [-1,1]){
    const r=row+dir, c=col+dc;
    if(inBounds(r,c)){
      if(boardState[r][c] && isEnemy(boardState[r][c], isWhite)) moves.push({row:r,col:c});
      if(enPassantTarget && enPassantTarget.row===r && enPassantTarget.col===c) moves.push({row:r,col:c,enPassant:true});
    }
  }
  return moves;
}

function getRookMoves(b,r,c,isWhite){ return slideMoves(b,r,c,isWhite,[[1,0],[-1,0],[0,1],[0,-1]]); }
function getKnightMoves(b,row,col,isWhite){
  const moves=[]; const jumps=[[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
  for(let [dr,dc] of jumps){ const rr=row+dr, cc=col+dc; if(inBounds(rr,cc)){ if(!b[rr][cc] || isEnemy(b[rr][cc], isWhite)) moves.push({row:rr,col:cc}); } }
  return moves;
}
function getBishopMoves(b,r,c,isWhite){ return slideMoves(b,r,c,isWhite,[[1,1],[1,-1],[-1,1],[-1,-1]]); }
function getQueenMoves(b,r,c,isWhite){ return slideMoves(b,r,c,isWhite,[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]); }

function squareIsAttacked(boardState,targetRow,targetCol,byWhite){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const piece = boardState[r][c]; if(!piece) continue;
    const pieceIsWhite = piece===piece.toUpperCase(); if(pieceIsWhite !== byWhite) continue;
    const moves = getMovesForPiece(boardState,r,c);
    if(moves.some(m=>m.row===targetRow && m.col===targetCol)) return true;
  }
  return false;
}

function getKingMoves(boardState,row,col,isWhite){
  const moves=[]; const dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  for(let [dr,dc] of dirs){ const r=row+dr, c=col+dc; if(inBounds(r,c)){ if(!boardState[r][c] || isEnemy(boardState[r][c], isWhite)) moves.push({row:r,col:c}); } }

  if(isWhite){
    if(row===7 && col===4){
      if(castlingRights.wK && !boardState[7][5] && !boardState[7][6] && !squareIsAttacked(boardState,7,4,false) && !squareIsAttacked(boardState,7,5,false) && !squareIsAttacked(boardState,7,6,false)) moves.push({row:7,col:6,castle:'K'});
      if(castlingRights.wQ && !boardState[7][3] && !boardState[7][2] && !boardState[7][1] && !squareIsAttacked(boardState,7,4,false) && !squareIsAttacked(boardState,7,3,false) && !squareIsAttacked(boardState,7,2,false)) moves.push({row:7,col:2,castle:'Q'});
    }
  } else {
    if(row===0 && col===4){
      if(castlingRights.bK && !boardState[0][5] && !boardState[0][6] && !squareIsAttacked(boardState,0,4,true) && !squareIsAttacked(boardState,0,5,true) && !squareIsAttacked(boardState,0,6,true)) moves.push({row:0,col:6,castle:'K'});
      if(castlingRights.bQ && !boardState[0][3] && !boardState[0][2] && !boardState[0][1] && !squareIsAttacked(boardState,0,4,true) && !squareIsAttacked(boardState,0,3,true) && !squareIsAttacked(boardState,0,2,true)) moves.push({row:0,col:2,castle:'Q'});
    }
  }
  return moves;
}

function getMovesForPiece(boardState,row,col){
  const piece = boardState[row][col]; if(!piece) return [];
  const isWhite = piece===piece.toUpperCase();
  switch(piece.toLowerCase()){
    case 'p': return getPawnMoves(boardState,row,col,isWhite);
    case 'r': return getRookMoves(boardState,row,col,isWhite);
    case 'n': return getKnightMoves(boardState,row,col,isWhite);
    case 'b': return getBishopMoves(boardState,row,col,isWhite);
    case 'q': return getQueenMoves(boardState,row,col,isWhite);
    case 'k': return getKingMoves(boardState,row,col,isWhite);
  }
  return [];
}

/* Check logic */
function findKing(boardState,isWhite){
  const kingChar = isWhite ? 'K' : 'k';
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) if(boardState[r][c]===kingChar) return {row:r,col:c};
  return null;
}
function isKingInCheck(boardState,isWhite){
  const kp = findKing(boardState,isWhite); if(!kp) return false;
  return squareIsAttacked(boardState,kp.row,kp.col,!isWhite);
}

/* Simulation */
function simulateMove(boardState,from,to,currentEnPassant,currentCastling){
  const newBoard = cloneBoard(boardState);
  const piece = newBoard[from.row][from.col];
  newBoard[to.row][to.col] = piece;
  newBoard[from.row][from.col] = '';
  const newCastling = Object.assign({}, currentCastling);
  let newEnPassant = null;

  if(to.enPassant) newBoard[from.row][to.col] = '';

  if(to.castle){
    if(piece==='K'){ if(to.castle==='K'){ newBoard[7][5]=newBoard[7][7]; newBoard[7][7]=''; } else { newBoard[7][3]=newBoard[7][0]; newBoard[7][0]=''; } }
    else if(piece==='k'){ if(to.castle==='K'){ newBoard[0][5]=newBoard[0][7]; newBoard[0][7]=''; } else { newBoard[0][3]=newBoard[0][0]; newBoard[0][0]=''; } }
  }

  if(piece==='K'){ newCastling.wK=false; newCastling.wQ=false; } else if(piece==='k'){ newCastling.bK=false; newCastling.bQ=false; }
  if(from.row===7 && from.col===7) newCastling.wK=false;
  if(from.row===7 && from.col===0) newCastling.wQ=false;
  if(from.row===0 && from.col===7) newCastling.bK=false;
  if(from.row===0 && from.col===0) newCastling.bQ=false;

  const capturedAt = (to.enPassant ? {row:from.row,col:to.col} : {row:to.row,col:to.col});
  if(capturedAt.row===7 && capturedAt.col===7) newCastling.wK=false;
  if(capturedAt.row===7 && capturedAt.col===0) newCastling.wQ=false;
  if(capturedAt.row===0 && capturedAt.col===7) newCastling.bK=false;
  if(capturedAt.row===0 && capturedAt.col===0) newCastling.bQ=false;

  if(piece && piece.toLowerCase()==='p' && Math.abs(to.row-from.row)===2) newEnPassant = { row:(from.row+to.row)/2, col:from.col };
  else newEnPassant = null;

  return { board:newBoard, castling:newCastling, enPassant:newEnPassant };
}

/* Legal filtering */
function getLegalMoves(boardState,row,col,currentEnPassant,currentCastling){
  const piece = boardState[row][col]; if(!piece) return [];
  const isWhite = piece===piece.toUpperCase();
  const moves = getMovesForPiece(boardState,row,col);
  return moves.filter(move => {
    const sim = simulateMove(boardState,{row,col},move,currentEnPassant,currentCastling);
    return !isKingInCheck(sim.board,isWhite);
  });
}

function hasAnyLegalMoves(boardState,isWhite,currentEnPassant,currentCastling){
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const piece = boardState[r][c];
    if(piece && (piece===piece.toUpperCase())===isWhite){
      const moves = getLegalMoves(boardState,r,c,currentEnPassant,currentCastling);
      if(moves.length>0) return true;
    }
  }
  return false;
}

/* Position key & repetition */
function getPositionKey(boardState,sideToMove,enPassant,castling){
  let key = boardState.map(row => row.map(cell => cell||'.').join("")).join("/");
  key += sideToMove ? " w" : " b";
  let cr = "";
  if(castling.wK) cr += "K";
  if(castling.wQ) cr += "Q";
  if(castling.bK) cr += "k";
  if(castling.bQ) cr += "q";
  if(cr==="") cr="-";
  key += ` ${cr}`;
  if(enPassant) key += ` ep${enPassant.row}${enPassant.col}`; else key += " ep-";
  return key;
}
function updatePositionLog(){
  const key = getPositionKey(board,whiteTurn,enPassantTarget,castlingRights);
  const prev = positionLog.get(key) || 0;
  const now = prev + 1;
  positionLog.set(key, now);
  if(now >= 3){ gameOver = true; showGameOverOverlay("Draw by threefold repetition!"); positionLog.clear(); }
}

/* Insufficient material */
function hasInsufficientMaterial(boardState){
  let whitePieces=[], blackPieces=[], whiteBishopsSquares=[], blackBishopsSquares=[];
  for(let r=0;r<8;r++) for(let c=0;c<8;c++){
    const p = boardState[r][c]; if(!p) continue;
    const isW = p===p.toUpperCase(); const lower = p.toLowerCase();
    if(isW) whitePieces.push(lower); else blackPieces.push(lower);
    if(lower==='b'){ const color = (r+c)%2===0 ? 'light' : 'dark'; if(isW) whiteBishopsSquares.push(color); else blackBishopsSquares.push(color); }
  }
  if(whitePieces.length===1 && blackPieces.length===1) return true;
  if((whitePieces.length===2 && whitePieces.includes('k') && (whitePieces.includes('n')||whitePieces.includes('b')) && blackPieces.length===1) ||
     (blackPieces.length===2 && blackPieces.includes('k') && (blackPieces.includes('n')||blackPieces.includes('b')) && whitePieces.length===1)) return true;
  if(whitePieces.length===2 && blackPieces.length===2 && whitePieces.includes('k') && whitePieces.includes('b') && blackPieces.includes('k') && blackPieces.includes('b')){
    if(whiteBishopsSquares.length===1 && blackBishopsSquares.length===1 && whiteBishopsSquares[0]===blackBishopsSquares[0]) return true;
  }
  return false;
}

/* Game over checks */
function checkGameOver(){
  if(gameOver) return;
  if(hasInsufficientMaterial(board)){ gameOver=true; showGameOverOverlay("Draw by insufficient material! No checkmate possible."); positionLog.clear(); return; }
  const isW = whiteTurn;
  const inCheck = isKingInCheck(board,isW);
  const hasMoves = hasAnyLegalMoves(board,isW,enPassantTarget,castlingRights);
  if(!hasMoves){ gameOver=true; if(inCheck) showGameOverOverlay((isW?"White":"Black")+" is checkmated! Viking death of the king!"); else showGameOverOverlay("Stalemate! The battle ends in a draw."); positionLog.clear(); return; }
  if(halfMoveClock >= 100){ gameOver=true; showGameOverOverlay("Draw by 50-move rule! No pawn pushes or captures."); positionLog.clear(); return; }
}

/* Apply move locally (then send to server) */
function applyMoveLocal(from,to, sendToServer = true){
  if(gameOver) return;
  const piece = board[from.row][from.col]; if(!piece) return;
  const isCapture = !!board[to.row][to.col] || !!to.enPassant;
  captureFlag = isCapture;
  if(to.enPassant) board[from.row][to.col] = '';
  if(to.castle){
    if(piece==='K'){ if(to.castle==='K'){ board[7][5]=board[7][7]; board[7][7]=''; } else { board[7][3]=board[7][0]; board[7][0]=''; } }
    else if(piece==='k'){ if(to.castle==='K'){ board[0][5]=board[0][7]; board[0][7]=''; } else { board[0][3]=board[0][0]; board[0][0]=''; } }
  }
  board[to.row][to.col] = piece;
  board[from.row][from.col] = '';

  if(piece==='K'){ castlingRights.wK=false; castlingRights.wQ=false; } else if(piece==='k'){ castlingRights.bK=false; castlingRights.bQ=false; }
  if(from.row===7 && from.col===7) castlingRights.wK=false;
  if(from.row===7 && from.col===0) castlingRights.wQ=false;
  if(from.row===0 && from.col===7) castlingRights.bK=false;
  if(from.row===0 && from.col===0) castlingRights.bQ=false;

  const capturedAt = (to.enPassant ? {row:from.row,col:to.col} : {row:to.row,col:to.col});
  if(capturedAt.row===7 && capturedAt.col===7) castlingRights.wK=false;
  if(capturedAt.row===7 && capturedAt.col===0) castlingRights.wQ=false;
  if(capturedAt.row===0 && capturedAt.col===7) castlingRights.bK=false;
  if(capturedAt.row===0 && capturedAt.col===0) castlingRights.bQ=false;

  // Promotion
  if((piece==='P' && to.row===0) || (piece==='p' && to.row===7)){
    showPromotionMenuAt(piece==='p', to.row, to.col, (choice) => {
      switch(choice){
        case 'r': board[to.row][to.col] = piece==='P' ? 'R' : 'r'; break;
        case 'b': board[to.row][to.col] = piece==='P' ? 'B' : 'b'; break;
        case 'n': board[to.row][to.col] = piece==='P' ? 'N' : 'n'; break;
        default:  board[to.row][to.col] = piece==='P' ? 'Q' : 'q'; break;
      }
      halfMoveClock = 0;
      enPassantTarget = null;
      whiteTurn = !whiteTurn;
      if(sendToServer) postMoveToServer(from,to);
      updatePositionLog();
      render();
      checkGameOver();
    });
    return;
  }

  if(piece.toLowerCase()==='p' && Math.abs(to.row-from.row)===2) enPassantTarget = { row:(from.row+to.row)/2, col:from.col };
  else enPassantTarget = null;

  if(piece.toLowerCase()==='p' || isCapture) halfMoveClock = 0; else halfMoveClock++;

  whiteTurn = !whiteTurn;

  if(sendToServer) postMoveToServer(from,to);
  updatePositionLog();
  render();
  checkGameOver();
}

/* Interaction: clicks are in display coords; convert to board coords */
canvas.addEventListener("click", (e) => {
  if(gameOver) return;
  if(whiteTurn){ // this client only moves when whiteTurn is false (Black)
    selected = null; legalMoves = []; render(); return;
  }

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const dCol = Math.floor(x / SIZE);
  const dRow = Math.floor(y / SIZE);
  if(!inBounds(dRow,dCol)) return;

  const { row, col } = displayToBoard(dRow, dCol);
  const piece = board[row][col];
  const isBlackPiece = piece && piece === piece.toLowerCase();

  if(!selected){
    if(piece && isBlackPiece === true){
      selected = { row, col };
      legalMoves = getLegalMoves(board, row, col, enPassantTarget, castlingRights);
    }
  } else {
    // find a legal move that matches the clicked board square
    const move = legalMoves.find(m => m.row === row && m.col === col);
    if(move){
      applyMoveLocal(selected, move, true);
      selected = null; legalMoves = [];
    } else if(piece && isBlackPiece === true){
      selected = { row, col };
      legalMoves = getLegalMoves(board, row, col, enPassantTarget, castlingRights);
    } else {
      selected = null; legalMoves = [];
    }
  }
  render();
});

/* Promotion UI (positioned relative to canvas display coordinates) */
function showPromotionMenuAt(isBlack, squareRow, squareCol, onChoose) {
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
    btn.textContent = unicodePieces[isBlack ? opt : opt.toUpperCase()];
    btn.onclick = () => {
      overlay.remove();
      onChoose(opt);
    };
    overlay.appendChild(btn);
  });

  document.body.appendChild(overlay);

  const rect = canvas.getBoundingClientRect();
  const disp = boardToDisplay(squareRow, squareCol);
  const squareLeft = rect.left + disp.dCol * SIZE;
  const squareTop = rect.top + disp.dRow * SIZE;

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

/* Overlays */
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

/* Status */
function updateStatus(){
  if(gameOver) statusEl.textContent = "Game over.";
  else statusEl.textContent = `${whiteTurn ? "White" : "Black"} to move. Half-move clock: ${halfMoveClock}.`;
}

/* Server communication */
async function fetchStateFromServer(){
  try {
    const res = await fetch(`${SERVER_BASE}/state`);
    if(!res.ok) throw new Error("Bad response");
    const s = await res.json();
    // Apply server state to local copy
    board = s.board;
    whiteTurn = !!s.whiteTurn;
    enPassantTarget = s.enPassantTarget || null;
    castlingRights = s.castlingRights || { wK:true, wQ:true, bK:true, bQ:true };
    halfMoveClock = s.halfMoveClock || 0;
    gameOver = !!s.gameOver;
    render();
  } catch (err) {
    // server unreachable — keep local state (offline mode)
  }
}

async function postMoveToServer(from,to){
  try {
    await fetch(`${SERVER_BASE}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to })
    });
    // after posting, fetch authoritative state
    setTimeout(fetchStateFromServer, 200);
  } catch (err) {
    // server unreachable — operate in local-only mode
  }
}

/* Controls */
document.getElementById("offer-draw").addEventListener("click", async () => {
  if(gameOver) return;
  const offering = "Black";
  const opponent = "White";
  const accept = confirm(`${offering} offers a draw. ${opponent}, do you accept the draw?`);
  if (accept) {
    gameOver = true;
    showGameOverOverlay("Draw by agreement! Both sides lay down arms.");
    try { await fetch(`${SERVER_BASE}/draw`, { method: "POST" }); } catch(e){}
  } else {
    alert("Draw offer declined.");
  }
});

document.getElementById("resign").addEventListener("click", async () => {
  if(gameOver) return;
  const resigning = "Black";
  const winner = "White";
  const ok = confirm(`${resigning} will resign. Confirm resignation?`);
  if (!ok) return;
  gameOver = true;
  showGameOverOverlay(`${resigning} resigns! ${winner} wins.`);
  try { await fetch(`${SERVER_BASE}/resign`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ side: "black" }) }); } catch(e){}
});

document.getElementById("reset").addEventListener("click", async () => {
  resetGame();
  try { await fetch(`${SERVER_BASE}/reset`, { method: "POST" }); } catch(e){}
});

document.getElementById("sync").addEventListener("click", () => fetchStateFromServer());

/* Initialization helpers */
function startPositionLog(){
  positionLog.clear();
  const key = getPositionKey(board, whiteTurn, enPassantTarget, castlingRights);
  positionLog.set(key, 1);
}

function resetGame(){
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
  selected = null; legalMoves = []; whiteTurn = true; enPassantTarget = null; gameOver = false;
  castlingRights = { wK:true, wQ:true, bK:true, bQ:true }; halfMoveClock = 0; positionLog.clear(); captureFlag = false;
  startPositionLog(); render();
  const existing = document.getElementById("gameover-overlay"); if(existing) existing.remove();
  const promo = document.getElementById("promotion-overlay"); if(promo) promo.remove();
}

/* Polling loop */
setInterval(fetchStateFromServer, POLL_INTERVAL_MS);

/* Start */
startPositionLog();
render();
fetchStateFromServer();