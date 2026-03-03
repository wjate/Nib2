// DOS Nibbles clone with two players, sequential numbers, lives and scoring.

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const grid = 20;

// state
canvas.width = 600;
canvas.height = 600;
const columns = canvas.width / grid;
const rows = canvas.height / grid;
let players = [];
let currentNumber = 1;
let level = 1;
let speedDelay = 100; // ms between updates
let intervalId;
let mode = 'double';
let numberPos;

// ui
const settingsDiv = document.getElementById('settings');
const infoDiv = document.getElementById('info');
const scoreDisplay = document.getElementById('scoreDisplay');
const livesDisplay = document.getElementById('livesDisplay');

function initPlayers(p1name, p2name) {
    players = [
        {
            name: p1name,
            color: '#ff0', // yellow
            body: [{x: 2 * grid, y: 2 * grid}],
            dx: grid,
            dy: 0,
            lives: 5,
            score: 0,
            controls: {up: 'w', down: 's', left: 'a', right: 'd'}
        },
        {
            name: p2name,
            color: '#faa', // light red
            body: [{x: (columns-3) * grid, y: (rows-3) * grid}],
            dx: -grid,
            dy: 0,
            lives: 5,
            score: 0,
            controls: {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
        }
    ];
}

function randomNumberPosition() {
    let position;
    while (true) {
        position = {
            x: Math.floor(Math.random() * columns) * grid,
            y: Math.floor(Math.random() * rows) * grid
        };
        let bad = false;
        players.forEach(p => {
            p.body.forEach(seg => {
                if (seg.x === position.x && seg.y === position.y) bad = true;
            });
        });
        if (!bad) break;
    }
    return position;
}

function draw() {
    ctx.fillStyle = '#00f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(numberPos.x, numberPos.y, grid, grid);
    ctx.fillStyle = '#000';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentNumber, numberPos.x + grid/2, numberPos.y + grid/2);
    players.forEach(p => {
        ctx.fillStyle = p.color;
        p.body.forEach(seg => ctx.fillRect(seg.x, seg.y, grid, grid));
    });
}

function update() {
    let collisionOccurred = false;
    players.forEach(p => {
        if (collisionOccurred) return;
        const head = {x: p.body[0].x + p.dx, y: p.body[0].y + p.dy};
        if (head.x < 0 || head.x >= canvas.width || head.y < 0 || head.y >= canvas.height) {
            dieBoth();
            collisionOccurred = true;
            return;
        }
        for (let i = 0; i < p.body.length; i++) {
            if (p.body[i].x === head.x && p.body[i].y === head.y) {
                dieBoth();
                collisionOccurred = true;
                return;
            }
        }
        players.forEach(other => {
            if (other !== p) {
                other.body.forEach(seg => {
                    if (seg.x === head.x && seg.y === head.y) {
                        dieBoth();
                        collisionOccurred = true;
                    }
                });
            }
        });
        if (collisionOccurred) return;
        if (head.x === numberPos.x && head.y === numberPos.y) {
            p.score += currentNumber * 100;
            currentNumber++;
            if (currentNumber > 9) {
                nextLevel();
            } else {
                numberPos = randomNumberPosition();
            }
        } else {
            p.body.pop();
        }
        p.body.unshift(head);
    });
    draw();
    updateInfo();
    checkGameOver();
}

function dieBoth() {
    players.forEach((player, idx) => {
        player.lives -= 1;
        player.score -= 1000;
        const startX = idx === 0 ? 2*grid : (columns-3)*grid;
        const startY = idx === 0 ? 2*grid : (rows-3)*grid;
        player.body = [{x: startX, y: startY}];
        player.dx = idx === 0 ? grid : -grid;
        player.dy = 0;
    });
}

function nextLevel() {
    level++;
    currentNumber = 1;
    speedDelay = Math.max(20, speedDelay - 10);
    clearInterval(intervalId);
    intervalId = setInterval(update, speedDelay);
    numberPos = randomNumberPosition();
}

function updateInfo() {
    let scoreText = players.map(p => `${p.name}: ${p.score}`).join(' | ');
    let livesText = players.map(p => `${p.name} lives: ${p.lives}`).join(' | ');
    scoreDisplay.textContent = scoreText;
    livesDisplay.textContent = livesText;
}

function changeDirection(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    players.forEach(p => {
        if (key === p.controls.left && p.dx === 0) {
            p.dx = -grid; p.dy = 0;
        } else if (key === p.controls.right && p.dx === 0) {
            p.dx = grid; p.dy = 0;
        } else if (key === p.controls.up && p.dy === 0) {
            p.dx = 0; p.dy = -grid;
        } else if (key === p.controls.down && p.dy === 0) {
            p.dx = 0; p.dy = grid;
        }
    });
}

document.addEventListener('keydown', changeDirection);

function start() {
    mode = document.getElementById('mode').value;
    const p1 = document.getElementById('p1name').value || 'Player1';
    const p2 = document.getElementById('p2name').value || 'Player2';
    const speedInput = parseInt(document.getElementById('speed').value, 10);
    speedDelay = Math.max(1, 201 - speedInput * 2);
    initPlayers(p1, p2);
    numberPos = randomNumberPosition();
    settingsDiv.style.display = 'none';
    canvas.style.display = 'block';
    infoDiv.style.display = 'block';
    updateInfo();
    clearInterval(intervalId);
    intervalId = setInterval(update, speedDelay);
}

document.getElementById('startBtn').addEventListener('click', start);

// high score persistence
function loadHighScores() {
    const raw = localStorage.getItem('nibblesHighScores');
    return raw ? JSON.parse(raw) : [];
}
function saveHighScores(scores) {
    localStorage.setItem('nibblesHighScores', JSON.stringify(scores));
}
function recordScore(name, score) {
    const scores = loadHighScores();
    scores.push({name, score});
    scores.sort((a,b)=>b.score-a.score);
    saveHighScores(scores.slice(0,10));
}
function showHighScores() {
    const scores = loadHighScores();
    let msg = 'HIGH SCORES\n';
    scores.forEach((s,i)=>{msg += `${i+1}. ${s.name} ${s.score}\n`;});
    alert(msg);
}

function checkGameOver() {
    if (mode === 'single') {
        if (players[0].lives <= 0) gameOver();
    } else {
        if (players.every(p=>p.lives<=0)) gameOver();
    }
}

function gameOver() {
    clearInterval(intervalId);
    players.forEach(p=> recordScore(p.name, p.score));
    showHighScores();
    settingsDiv.style.display='block';
    canvas.style.display='none';
    infoDiv.style.display='none';
}
