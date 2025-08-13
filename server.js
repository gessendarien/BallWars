// Servidor para BallWars Pool - Juego de billar multijugador con vista aérea
// Ejecuta: node server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// Estructura de salas
const rooms = {};

// Configuración del mundo de juego
const WORLD_WIDTH = 2400;
const WORLD_HEIGHT = 1600;
const BALL_RADIUS = 20;

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    socket.on('createRoom', (data) => {
        // Validar datos
        if (!data.username || !data.gameMode || !data.numPlayers) {
            socket.emit('roomError', 'Datos incompletos');
            return;
        }

        // Validar límites según modo de juego
        if (data.gameMode === 'teams' && (data.numPlayers < 2 || data.numPlayers > 6)) {
            socket.emit('roomError', 'Los equipos solo permiten de 2 a 6 jugadores (máximo 3 vs 3)');
            return;
        }
        if (data.gameMode === 'ffa' && (data.numPlayers < 2 || data.numPlayers > 8)) {
            socket.emit('roomError', 'Todos contra todos permite de 2 a 8 jugadores');
            return;
        }
        if (data.gameMode === 'ctf' && (data.numPlayers < 4 || data.numPlayers > 6 || data.numPlayers % 2 !== 0)) {
            socket.emit('roomError', 'Captura la bandera requiere 4 o 6 jugadores (equipos iguales)');
            return;
        }

        // Generar ID de sala único
        let roomId;
        do {
            roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        } while (rooms[roomId]);

        rooms[roomId] = {
            roomId: roomId,
            host: socket.id,
            users: [{ id: socket.id, username: data.username, team: null }],
            gameMode: data.gameMode,
            numPlayers: data.numPlayers,
            textChat: data.textChat,
            voiceChat: data.voiceChat,
            started: false,
            chatMessages: [],
            voiceChatMode: 'normal' // 'normal', 'global' (cuando alguien cae en hoyo)
        };

        socket.join(roomId);
        socket.emit('roomJoined', { 
            roomId, 
            users: rooms[roomId].users, 
            numPlayers: data.numPlayers, 
            host: rooms[roomId].host,
            gameMode: data.gameMode
        });
    });

    socket.on('joinRoom', (data) => {
        const room = rooms[data.roomId];
        if (!room) {
            socket.emit('roomError', 'Sala no encontrada');
            return;
        }
        if (room.users.length >= room.numPlayers) {
            socket.emit('roomError', 'Sala llena');
            return;
        }

        room.users.push({ id: socket.id, username: data.username, team: null });
        socket.join(data.roomId);

        setTimeout(() => {
            io.in(data.roomId).emit('roomJoined', { 
                roomId: data.roomId, 
                users: room.users, 
                numPlayers: room.numPlayers, 
                host: room.host,
                gameMode: room.gameMode
            });

            if (room.users.length === room.numPlayers) {
                io.to(room.host).emit('showTeamSelection', { roomId: data.roomId });
            }
        }, 100);
    });

    socket.on('updateTeams', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;

        // Actualizar equipos de los usuarios
        data.teams.forEach(teamData => {
            teamData.players.forEach(playerId => {
                const user = room.users.find(u => u.id === playerId);
                if (user) {
                    user.team = teamData.id;
                }
            });
        });

        io.in(data.roomId).emit('teamsUpdated', { teams: data.teams, users: room.users });
    });

    socket.on('startGame', (data) => {
        const room = rooms[data.roomId];
        if (!room || room.host !== socket.id) return;

        room.started = true;
        const gameData = initializeGame(room);
        room.gameState = gameData.gameState;

        console.log(`Juego iniciado en sala ${data.roomId}. Turno inicial: ${room.gameState.turno}, jugador: ${room.gameState.bolas[room.gameState.turno].username}`);

        io.in(data.roomId).emit('startGame', {
            roomId: data.roomId,
            bolas: gameData.gameState.bolas,
            turno: gameData.gameState.turno,
            hoyos: gameData.gameState.hoyos,
            gameMode: room.gameMode,
            teams: gameData.teams,
            bases: gameData.bases,
            flags: gameData.flags,
            textChat: room.textChat,
            voiceChat: room.voiceChat
        });
    });

    socket.on('shoot', ({ roomId, angulo, fuerza }) => {
        const room = rooms[roomId];
        if (!room || !room.gameState) return;

        const { bolas, turno } = room.gameState;
        const currentPlayer = bolas[turno];
        
        if (currentPlayer.id !== socket.id || !currentPlayer.alive) {
            console.log(`Tiro rechazado: jugador actual ID=${currentPlayer.id}, socket=${socket.id}, vivo=${currentPlayer.alive}`);
            return;
        }

        console.log(`Tiro ejecutado por ${currentPlayer.username} (turno ${turno})`);

        // Aplicar tiro
        const velocityFactor = 0.15;
        currentPlayer.vx = velocityFactor * fuerza * Math.cos(angulo);
        currentPlayer.vy = velocityFactor * fuerza * Math.sin(angulo);
        
        room.gameState.enTiro = true;
        
        // Simular física hasta que se detenga todo
        simulatePhysics(room, () => {
            // Verificar eliminaciones
            const eliminatedPlayers = checkEliminations(room);
            
            // Pasar al siguiente turno solo si el juego no ha terminado
            if (!checkWinCondition(room)) {
                nextTurn(room);
                console.log(`Siguiente turno: ${room.gameState.turno}, jugador: ${room.gameState.bolas[room.gameState.turno].username}`);
                
                room.gameState.enTiro = false;
                io.in(roomId).emit('gameState', {
                    bolas: room.gameState.bolas.map(b => ({...b})),
                    turno: room.gameState.turno,
                    flags: room.gameState.flags || []
                });
            }
        });

        // Enviar estado inicial tras el tiro
        io.in(roomId).emit('gameState', {
            bolas: room.gameState.bolas.map(b => ({...b})),
            turno: room.gameState.turno,
            flags: room.gameState.flags || []
        });
    });

    // Chat de texto
    socket.on('chatMessage', (data) => {
        const room = rooms[data.roomId];
        if (!room || !room.textChat) return;

        const user = room.users.find(u => u.id === socket.id);
        if (!user) return;

        const message = {
            id: socket.id,
            username: user.username,
            team: user.team,
            message: data.message,
            timestamp: Date.now()
        };

        room.chatMessages.push(message);
        
        // Limitar historial de chat
        if (room.chatMessages.length > 50) {
            room.chatMessages = room.chatMessages.slice(-50);
        }

        io.in(data.roomId).emit('chatMessage', message);
    });

    // Chat de voz - señalización WebRTC
    socket.on('voiceOffer', (data) => {
        const room = rooms[data.roomId];
        if (!room || !room.voiceChat) return;
        
        const sender = room.users.find(u => u.id === socket.id);
        const target = room.users.find(u => u.id === data.targetId);
        
        if (!sender || !target) return;

        // Verificar si pueden comunicarse según el modo de juego
        if (canCommunicate(room, sender, target)) {
            socket.to(data.targetId).emit('voiceOffer', {
                offer: data.offer,
                senderId: socket.id
            });
        }
    });

    socket.on('voiceAnswer', (data) => {
        socket.to(data.targetId).emit('voiceAnswer', {
            answer: data.answer,
            senderId: socket.id
        });
    });

    socket.on('voiceIceCandidate', (data) => {
        socket.to(data.targetId).emit('voiceIceCandidate', {
            candidate: data.candidate,
            senderId: socket.id
        });
    });

    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
        // Limpiar salas vacías
        for (const roomId in rooms) {
            const room = rooms[roomId];
            room.users = room.users.filter(u => u.id !== socket.id);
            
            // Si el juego está en curso, marcar como desconectado pero no eliminar inmediatamente
            if (room.gameState && room.started) {
                const disconnectedBall = room.gameState.bolas.find(b => b.id === socket.id);
                if (disconnectedBall) {
                    disconnectedBall.disconnected = true;
                    // Si es su turno, pasar al siguiente
                    if (room.gameState.bolas[room.gameState.turno].id === socket.id) {
                        nextTurn(room);
                        io.in(roomId).emit('gameState', {
                            bolas: room.gameState.bolas.map(b => ({...b})),
                            turno: room.gameState.turno,
                            flags: room.gameState.flags || []
                        });
                    }
                }
            }
            
            if (room.users.length === 0) {
                delete rooms[roomId];
            } else if (room.host === socket.id && room.users.length > 0) {
                room.host = room.users[0].id;
            }
        }
    });
});

function canCommunicate(room, sender, target) {
    // En modo FFA, todos se escuchan
    if (room.gameMode === 'ffa') return true;
    
    // En modo global (cuando alguien cae en hoyo), todos se escuchan
    if (room.voiceChatMode === 'global') return true;
    
    // En modos de equipo, solo el mismo equipo se escucha
    if (room.gameMode === 'teams' || room.gameMode === 'ctf') {
        return sender.team === target.team;
    }
    
    return false;
}

// Función para procesar el temporizador de turno
function processTurnTimer(room) {
    if (!room || !room.gameState || room.gameState.enTiro) return;
    
    const currentTime = Date.now();
    const elapsedTime = (currentTime - room.gameState.lastTurnTime) / 1000;
    room.gameState.turnTimer = Math.max(0, 30 - elapsedTime);

    // Emitir advertencia cuando quedan 15 segundos
    if (Math.floor(room.gameState.turnTimer) === 15) {
        io.in(room.roomId).emit('turnTimeWarning', {
            timeLeft: 15
        });
    }

    // Si se acabó el tiempo, pasar al siguiente turno
    if (room.gameState.turnTimer <= 0) {
        nextTurn(room);
        io.in(room.roomId).emit('gameState', {
            bolas: room.gameState.bolas.map(b => ({...b})),
            turno: room.gameState.turno,
            flags: room.gameState.flags || [],
            turnTimer: room.gameState.turnTimer
        });
    }
}

// Iniciar el intervalo para procesar el temporizador de turno
setInterval(() => {
    Object.values(rooms).forEach(room => {
        if (room.started && !room.gameState.enTiro) {
            processTurnTimer(room);
        }
    });
}, 1000); // Actualizar cada segundo

function initializeGame(room) {
    const users = room.users;
    const gameMode = room.gameMode;
    const n = users.length;

    // Crear hoyos distribuidos por el mapa
    const hoyos = [];
    const hoyoPositions = [
        { x: 100, y: 100 }, { x: WORLD_WIDTH - 100, y: 100 },
        { x: 100, y: WORLD_HEIGHT - 100 }, { x: WORLD_WIDTH - 100, y: WORLD_HEIGHT - 100 },
        { x: WORLD_WIDTH / 2, y: 100 }, { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT - 100 },
        { x: 100, y: WORLD_HEIGHT / 2 }, { x: WORLD_WIDTH - 100, y: WORLD_HEIGHT / 2 }
    ];

    hoyoPositions.forEach(pos => {
        hoyos.push({ x: pos.x, y: pos.y, radio: 40 });
    });

    // Posiciones iniciales de los jugadores
    const bolas = users.map((u, i) => {
        const angle = (2 * Math.PI * i) / n;
        const radius = 300;
        return {
            id: u.id,
            username: u.username,
            x: WORLD_WIDTH / 2 + radius * Math.cos(angle),
            y: WORLD_HEIGHT / 2 + radius * Math.sin(angle),
            vx: 0,
            vy: 0,
            radio: BALL_RADIUS,
            color: i,
            alive: true,
            team: u.team !== null ? u.team : (gameMode === 'ffa' ? -1 : i % 2),
            friendlyFireCount: 0,
            trail: [], // Para la estela mágica
            disconnected: false,
            respawnX: gameMode === 'ctf' ? WORLD_WIDTH / 2 : null,
            respawnY: gameMode === 'ctf' ? WORLD_HEIGHT / 2 : null
        };
    });

    // Resto del código de initializeGame...
}


function checkCTFMechanics(room) {
    const { bolas, flags, bases } = room.gameState;
    
    for (const bola of bolas) {
        if (!bola.alive) continue;
        
        // Verificar si toca una bandera
        for (const flag of flags) {
            if (flag.carrier) continue; // Ya está siendo llevada
            
            const distance = Math.hypot(bola.x - flag.x, bola.y - flag.y);
            if (distance < bola.radio + 20) {
                // Solo puede tomar la bandera del equipo contrario
                if (bola.team !== flag.team) {
                    flag.carrier = bola.id;
                    flag.atBase = false;
                }
            }
        }
        
        // Actualizar posición de banderas llevadas
        for (const flag of flags) {
            if (flag.carrier === bola.id) {
                flag.x = bola.x;
                flag.y = bola.y;
                
                // Verificar si llegó a su base
                for (const base of bases) {
                    if (base.team === bola.team) {
                        const distance = Math.hypot(bola.x - base.x, bola.y - base.y);
                        if (distance < base.radio) {
                            // ¡Punto para el equipo!
                            io.in(room.roomId).emit('flagCaptured', {
                                team: bola.team,
                                player: bola.username
                            });
                            
                            // Victoria para el equipo
                            io.in(room.roomId).emit('gameOver', { 
                                winner: bola.team === 0 ? 'Equipo A' : 'Equipo B',
                                type: 'capture'
                            });
                            delete rooms[room.roomId];
                        }
                    }
                }
            }
        }
    }
}

function checkEliminations(room) {
    const { bolas, gameMode } = room.gameState;
    const eliminatedPlayers = [];
    
    for (const bola of bolas) {
        if (!bola.alive && bola.alive !== bola.wasAlive) {
            eliminatedPlayers.push(bola);
            
            // Lógica específica para CTF
            if (gameMode === 'ctf') {
                // Si llevaba la bandera, devolverla a su base
                if (room.gameState.flags) {
                    const carriedFlag = room.gameState.flags.find(f => f.carrier === bola.id);
                    if (carriedFlag) {
                        const originalBase = room.gameState.bases.find(b => b.team === carriedFlag.team);
                        carriedFlag.x = originalBase.x;
                        carriedFlag.y = originalBase.y;
                        carriedFlag.carrier = null;
                        carriedFlag.atBase = true;
                    }
                }
                
                // Respawnear al jugador
                bola.x = bola.respawnX || WORLD_WIDTH / 2;
                bola.y = bola.respawnY || WORLD_HEIGHT / 2;
                bola.vx = 0;
                bola.vy = 0;
                io.in(room.roomId).emit('playerRespawned', {
                    player: bola.username
                });
            }
            
            // Resto de la lógica de eliminación...
        }
        bola.wasAlive = bola.alive;
    }
    
    return eliminatedPlayers;
}

function nextTurn(room) {
    const { bolas, turnOrder } = room.gameState;
    
    // Buscar el siguiente jugador vivo y conectado
    let attempts = 0;
    let foundValidPlayer = false;
    
    do {
        room.gameState.currentTurnIndex = (room.gameState.currentTurnIndex + 1) % turnOrder.length;
        room.gameState.turno = turnOrder[room.gameState.currentTurnIndex];
        
        const currentPlayer = bolas[room.gameState.turno];
        if (currentPlayer.alive && !currentPlayer.disconnected) {
            foundValidPlayer = true;
            // Reset turn timer
            room.gameState.turnTimer = 30;
            room.gameState.lastTurnTime = Date.now();
            break;
        }
        
        attempts++;
    } while (attempts < turnOrder.length);
    
    // Si no encontramos jugador válido, verificar condición de victoria
    if (!foundValidPlayer) {
        console.log('No se encontró jugador válido para el siguiente turno');
        checkWinCondition(room);
    } else {
        console.log(`Turno asignado a: ${bolas[room.gameState.turno].username}`);
    }
}

function checkWinCondition(room) {
    const { bolas, gameMode } = room.gameState;
    const alivePlayers = bolas.filter(b => b.alive && !b.disconnected);
    
    console.log(`Verificando condición de victoria. Jugadores vivos: ${alivePlayers.length}`);
    
    if (gameMode === 'ffa') {
        if (alivePlayers.length <= 1) {
            const winner = alivePlayers.length === 1 ? alivePlayers[0].username : null;
            console.log(`Juego terminado. Ganador: ${winner || 'Empate'}`);
            io.in(room.roomId).emit('gameOver', { winner });
            delete rooms[room.roomId];
            return true;
        }
    } else if (gameMode === 'teams') {
        const aliveTeams = [...new Set(alivePlayers.map(p => p.team))];
        if (aliveTeams.length <= 1) {
            const winningTeam = aliveTeams.length === 1 ? aliveTeams[0] : null;
            const teamName = winningTeam !== null ? `Equipo ${winningTeam === 0 ? 'A' : 'B'}` : null;
            console.log(`Juego terminado. Equipo ganador: ${teamName || 'Empate'}`);
            io.in(room.roomId).emit('gameOver', { winner: teamName });
            delete rooms[room.roomId];
            return true;
        }
    }
    // CTF se maneja por separado con capturas de bandera
    
    return false;
}

server.listen(PORT, () => {
    console.log(`Servidor BallWars Pool escuchando en http://localhost:${PORT}`);
});