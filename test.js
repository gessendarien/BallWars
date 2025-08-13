// Cliente optimizado para BallWars Pool - VERSIÓN CORREGIDA
// Mejoras: Rendimiento, tracking de mouse, gestión de memoria y estabilidad

document.addEventListener('DOMContentLoaded', () => {
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const roomFormDiv = document.getElementById('room-form');
    const formTitle = document.getElementById('form-title');
    const roomConfigForm = document.getElementById('room-config-form');
    const createOptions = document.getElementById('create-options');
    const joinOptions = document.getElementById('join-options');
    const gameMode = document.getElementById('game-mode');
    const cancelBtn = document.getElementById('cancel-btn');

    let mode = null;
    const socket = io();
    window._mySocketId = null;
    
    // Variables para audio
    let audioContext;
    let collisionSound;
    let voiceChat = {
        enabled: false,
        localStream: null,
        peers: {},
        isTeamChat: false,
        allChatTimer: null
    };

    // Variables de juego - DECLARACIÓN GLOBAL OPTIMIZADA
    let gameState = null;
    let camera = { x: 0, y: 0 };
    let canvas, ctx;
    let ballTrails = new Map();
    let eligiendoAngulo = false;
    let cargandoFuerza = false;
    let angulo = 0;
    let fuerzaActual = 50;
    let fuerzaMin = 50;
    let fuerzaMax = 300;
    let fuerzaSube = true;
    let enTiro = false;
    let isMyTurn = false;
    let gameLoopRunning = false;
    
    // MEJORA: Variables de mouse optimizadas
    let mouseState = {
        x: 0,
        y: 0,
        lastValidX: 0,
        lastValidY: 0,
        insideCanvas: false,
        worldX: 0,
        worldY: 0
    };

    const WORLD_WIDTH = 2400;
    const WORLD_HEIGHT = 1600;

    // MEJORA: Inicialización de audio más robusta
    function initAudio() {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Crear sonido sintético mejorado
            const duration = 0.15;
            const sampleRate = audioContext.sampleRate;
            const frameCount = duration * sampleRate;
            const buffer = audioContext.createBuffer(2, frameCount, sampleRate); // Estéreo
            
            for (let channel = 0; channel < 2; channel++) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < frameCount; i++) {
                    const t = i / sampleRate;
                    const frequency = 250 * Math.exp(-t * 8);
                    const noise = (Math.random() - 0.5) * 0.1;
                    data[i] = (Math.sin(2 * Math.PI * frequency * t) + noise) * Math.exp(-t * 6) * 0.4;
                }
            }
            
            collisionSound = buffer;
            console.log('Audio mejorado inicializado');
            
        } catch (e) {
            console.warn('Audio no disponible:', e);
        }
    }

    function playCollisionSound(intensity = 1) {
        if (audioContext && collisionSound) {
            try {
                const source = audioContext.createBufferSource();
                source.buffer = collisionSound;
                
                const gainNode = audioContext.createGain();
                gainNode.gain.value = Math.min(0.8, intensity * 0.6);
                
                source.connect(gainNode);
                gainNode.connect(audioContext.destination);
                source.start();
            } catch (e) {
                console.warn('Error reproduciendo sonido:', e);
            }
        }
    }

    // Validar nombre de 4 caracteres máximo
    function validateUsername(input) {
        input.addEventListener('input', (e) => {
            if (e.target.value.length > 4) {
                e.target.value = e.target.value.substring(0, 4);
            }
        });
    }

    validateUsername(document.getElementById('username'));
    
    socket.on('connect', () => {
        window._mySocketId = socket.id;
        initAudio();
        console.log('Conectado con ID:', socket.id);
    });

    // CORRECCIÓN: Configuración de botones con verificación de elementos
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            console.log('Botón crear sala presionado');
            mode = 'create';
            roomFormDiv.style.display = 'block';
            formTitle.textContent = 'Crear Sala';
            createOptions.style.display = 'block';
            joinOptions.style.display = 'none';
        });
    }

    if (joinBtn) {
        joinBtn.addEventListener('click', () => {
            console.log('Botón unirse a sala presionado');
            mode = 'join';
            roomFormDiv.style.display = 'block';
            formTitle.textContent = 'Unirse a Sala';
            createOptions.style.display = 'none';
            joinOptions.style.display = 'block';
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            console.log('Botón cancelar presionado');
            roomFormDiv.style.display = 'none';
        });
    }

    if (roomConfigForm) {
        roomConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log('Formulario enviado, modo:', mode);
            
            if (mode === 'create') {
                const data = {
                    username: document.getElementById('username').value.trim(),
                    gameMode: document.getElementById('game-mode').value,
                    numPlayers: parseInt(document.getElementById('num-players').value, 10),
                    textChat: document.getElementById('text-chat').checked,
                    voiceChat: document.getElementById('voice-chat').checked
                };
                console.log('Datos para crear sala:', data);
                socket.emit('createRoom', data);
            } else if (mode === 'join') {
                const data = {
                    username: document.getElementById('username').value.trim(),
                    roomId: document.getElementById('room-id').value.trim()
                };
                console.log('Datos para unirse a sala:', data);
                socket.emit('joinRoom', data);
            }
        });
    }

    // MEJORA: Gestión de chat de voz optimizada
    async function initVoiceChat(isTeamMode) {
        if (!voiceChat.enabled) return;
        
        try {
            voiceChat.localStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            voiceChat.isTeamChat = isTeamMode;
            console.log('Chat de voz mejorado inicializado');
        } catch (e) {
            console.warn('No se pudo acceder al micrófono:', e);
            voiceChat.enabled = false;
        }
    }

    function setVoiceChatMode(allChat, duration = 0) {
        if (!voiceChat.enabled) return;
        
        const chatHeader = document.getElementById('chat-header');
        if (chatHeader) {
            if (allChat) {
                voiceChat.isTeamChat = false;
                chatHeader.innerHTML = 'Chat (Todos)' + (voiceChat.enabled ? '<span id="voice-status" style="float: right; color: #4f4;">🎤 ON</span>' : '');
                
                if (duration > 0) {
                    clearTimeout(voiceChat.allChatTimer);
                    voiceChat.allChatTimer = setTimeout(() => {
                        voiceChat.isTeamChat = true;
                        chatHeader.innerHTML = 'Chat (Equipo)' + (voiceChat.enabled ? '<span id="voice-status" style="float: right; color: #4f4;">🎤 ON</span>' : '');
                    }, duration);
                }
            } else {
                voiceChat.isTeamChat = true;
                chatHeader.innerHTML = 'Chat (Equipo)' + (voiceChat.enabled ? '<span id="voice-status" style="float: right; color: #4f4;">🎤 ON</span>' : '');
            }
        }
        
        updateVoiceConnections();
    }

    function updateVoiceConnections() {
        console.log('Actualizando conexiones de voz. Modo equipo:', voiceChat.isTeamChat);
    }

    // MEJORA: Función optimizada para verificar turno
    function updateTurnState() {
        if (!gameState?.bolas) {
            isMyTurn = false;
            return;
        }

        const currentPlayer = gameState.bolas[gameState.turno];
        const myPlayer = gameState.bolas.find(b => b.id === window._mySocketId);
        
        const wasMyTurn = isMyTurn;
        isMyTurn = !!(currentPlayer && myPlayer && 
                     currentPlayer.id === window._mySocketId && 
                     currentPlayer.alive && 
                     !enTiro);

        // Solo log cuando cambia el estado
        if (wasMyTurn !== isMyTurn) {
            console.log('Estado del turno actualizado:', {
                turno: gameState.turno,
                currentPlayerId: currentPlayer?.id,
                mySocketId: window._mySocketId,
                isMyTurn: isMyTurn
            });
        }
    }

    // Manejo de eventos del servidor
    socket.on('roomJoined', (roomInfo) => {
        console.log('Sala unida exitosamente:', roomInfo);
        window._roomId = roomInfo.roomId;
        window._numPlayers = Number(roomInfo.numPlayers) || 1;
        window._hostId = roomInfo.host;
        window._mySocketId = socket.id;
        window._gameMode = roomInfo.gameMode;
        const faltan = Math.max(0, window._numPlayers - roomInfo.users.length);
        
        if (roomInfo.users.length === 1 && window._numPlayers > 1) {
            navigator.clipboard.writeText(roomInfo.roomId).catch(() => {
                console.log('No se pudo copiar al portapapeles');
            });
            
            // Usar SweetAlert2 si está disponible, sino alert nativo
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'Sala creada',
                    html: `ID de sala: <b>${roomInfo.roomId}</b><br>¡ID copiado al portapapeles!<br>Comparte este ID para que otros se unan.`,
                    confirmButtonText: 'OK'
                }).then(() => {
                    if (roomInfo.gameMode === 'teams' || roomInfo.gameMode === 'ctf') {
                        mostrarConfiguracionEquipos(roomInfo);
                    } else {
                        mostrarPantallaEspera(roomInfo.roomId, faltan, roomInfo.users.map(u => u.username));
                    }
                });
            } else {
                alert(`Sala creada!\nID: ${roomInfo.roomId}\nComparte este ID para que otros se unan.`);
                if (roomInfo.gameMode === 'teams' || roomInfo.gameMode === 'ctf') {
                    mostrarConfiguracionEquipos(roomInfo);
                } else {
                    mostrarPantallaEspera(roomInfo.roomId, faltan, roomInfo.users.map(u => u.username));
                }
            }
        } else {
            if (window._gameMode === 'teams' || window._gameMode === 'ctf') {
                mostrarConfiguracionEquipos(roomInfo);
            } else {
                mostrarPantallaEspera(roomInfo.roomId, faltan, roomInfo.users.map(u => u.username));
            }
        }
    });

    socket.on('showTeamSelection', (data) => {
        console.log('Mostrar selección de equipos:', data);
        if (socket.id === window._hostId) {
            setTimeout(() => {
                const teamSetup = document.getElementById('team-setup');
                if (teamSetup && !document.getElementById('start-btn')) {
                    const btn = document.createElement('button');
                    btn.id = 'start-btn';
                    btn.textContent = 'Comenzar Juego';
                    btn.style.cssText = 'margin-top: 20px; padding: 15px 30px; font-size: 1.2em; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;';
                    btn.onclick = () => {
                        const teamAPlayers = Array.from(document.querySelectorAll('#team-a .player-card')).map(card => card.dataset.playerId);
                        const teamBPlayers = Array.from(document.querySelectorAll('#team-b .player-card')).map(card => card.dataset.playerId);
                        
                        const teams = [
                            { id: 0, name: 'Equipo A', players: teamAPlayers },
                            { id: 1, name: 'Equipo B', players: teamBPlayers }
                        ];
                        
                        socket.emit('updateTeams', { roomId: window._roomId, teams });
                        socket.emit('startGame', { roomId: window._roomId });
                    };
                    teamSetup.appendChild(btn);
                }
            }, 100);
        }
    });

    socket.on('roomError', (msg) => {
        console.error('Error de sala:', msg);
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: msg
            });
        } else {
            alert('Error: ' + msg);
        }
    });

    socket.on('ballCollision', (data) => {
        playCollisionSound(data.intensity);
    });

    socket.on('playerEliminated', (data) => {
        if ((window._gameMode === 'teams' || window._gameMode === 'ctf') && voiceChat.enabled) {
            setVoiceChatMode(true, 3000);
        }
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'info',
                title: `${data.player} eliminado!`,
                text: data.eliminatedBy ? `Eliminado por ${data.eliminatedBy}` : 'Cayó en un hoyo',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });

    socket.on('voiceModeChanged', (data) => {
        if (data.mode === 'global') {
            setVoiceChatMode(true, data.duration);
        } else {
            setVoiceChatMode(false);
        }
    });

    socket.on('startGame', (data) => {
        console.log('Juego iniciado:', data);
        createGameInterface(data);
        iniciarJuego(data);
    });

    socket.on('gameState', (state) => {
        if (!state?.bolas) return;
        updateGameState(state);
    });

    socket.on('gameOver', (data) => {
        console.log('Juego terminado:', data);
        gameLoopRunning = false; // MEJORA: Detener loop de dibujo
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'success',
                title: '¡Juego terminado!',
                text: data.winner ? `Ganador: ${data.winner}` : 'Empate',
                confirmButtonText: 'Volver al lobby'
            }).then(() => {
                cleanup();
                location.reload();
            });
        } else {
            alert(`¡Juego terminado!\nGanador: ${data.winner || 'Empate'}`);
            cleanup();
            location.reload();
        }
    });

    // Función para mostrar pantalla de espera (FFA)
    function mostrarPantallaEspera(roomId, faltan, usuarios) {
        console.log('Mostrando pantalla de espera');
        document.body.innerHTML = `
        <div id="waiting-room" style="padding: 20px; text-align: center;">
            <h2>Esperando jugadores...</h2>
            <p>ID de sala: <b>${roomId}</b></p>
            <p>Jugadores conectados: ${usuarios.length}/${window._numPlayers}</p>
            ${faltan > 0 ? `<p>Faltan ${faltan} jugador${faltan === 1 ? '' : 'es'}</p>` : ''}
            <div style="margin: 20px 0;">
                ${usuarios.map(username => `<div style="background: #333; color: white; padding: 10px; margin: 5px; border-radius: 5px; display: inline-block;">${username}</div>`).join('')}
            </div>
            ${faltan === 0 && socket.id === window._hostId ? '<button id="start-btn-ffa" style="padding: 15px 30px; font-size: 1.2em; background: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">Comenzar Juego</button>' : ''}
        </div>
        `;
        
        setTimeout(() => {
            const startBtnFFA = document.getElementById('start-btn-ffa');
            if (startBtnFFA) {
                startBtnFFA.addEventListener('click', () => {
                    console.log('Iniciando juego FFA');
                    socket.emit('startGame', { roomId: window._roomId });
                });
            }
        }, 100);       
    }

    // Función para mostrar configuración de equipos
    function mostrarConfiguracionEquipos(roomInfo) {
        console.log('Mostrando configuración de equipos');
        const users = roomInfo.users || [];
        const faltan = Math.max(0, window._numPlayers - users.length);
        
        document.body.innerHTML = `
        <div id="team-setup" style="padding: 20px; text-align: center;">
            <h2>Configuración de Equipos</h2>
            <p>ID de sala: <b>${roomInfo.roomId}</b></p>
            ${faltan > 0 ? `<p>Esperando ${faltan} jugador${faltan === 1 ? '' : 'es'} más...</p>` : ''}
            
            <div style="display: flex; justify-content: space-around; margin: 20px 0; align-items: flex-start;">
                <div id="team-a-container" style="border: 3px solid #ff4444; border-radius: 10px; padding: 15px; min-height: 200px; width: 200px;">
                    <h3 style="color: #ff4444; margin: 0 0 15px 0;">Equipo A</h3>
                    <div id="team-a" class="team-zone" data-team="A" style="min-height: 150px;"></div>
                </div>
                
                <div id="unassigned-container" style="border: 2px dashed #666; border-radius: 10px; padding: 15px; min-height: 200px; width: 200px;">
                    <h3 style="color: #aaa; margin: 0 0 15px 0;">Sin asignar</h3>
                    <div id="unassigned" class="team-zone" data-team="unassigned" style="min-height: 150px;">
                        ${users.map(user => `
                            <div class="player-card" draggable="true" data-player-id="${user.id}" style="
                                background: #333; 
                                color: white; 
                                padding: 8px 12px; 
                                margin: 5px; 
                                border-radius: 5px; 
                                cursor: move;
                                border: 2px solid #666;
                                user-select: none;
                                font-weight: bold;
                            ">
                                ${user.username}
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div id="team-b-container" style="border: 3px solid #4444ff; border-radius: 10px; padding: 15px; min-height: 200px; width: 200px;">
                    <h3 style="color: #4444ff; margin: 0 0 15px 0;">Equipo B</h3>
                    <div id="team-b" class="team-zone" data-team="B" style="min-height: 150px;"></div>
                </div>
            </div>
        </div>
        `;
        
        setupDragAndDrop();
    }

    function setupDragAndDrop() {
        let draggedElement = null;
        
        document.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('player-card')) {
                draggedElement = e.target;
                e.target.style.opacity = '0.5';
                e.dataTransfer.effectAllowed = 'move';
            }
        });
        
        document.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('player-card')) {
                e.target.style.opacity = '1';
                draggedElement = null;
            }
        });
        
        document.addEventListener('dragover', (e) => {
            if (e.target.classList.contains('team-zone') || e.target.closest('.team-zone')) {
                e.preventDefault();
                const zone = e.target.classList.contains('team-zone') ? e.target : e.target.closest('.team-zone');
                zone.style.background = 'rgba(255,255,255,0.1)';
            }
        });
        
        document.addEventListener('dragleave', (e) => {
            if (e.target.classList.contains('team-zone')) {
                e.target.style.background = '';
            }
        });
        
        document.addEventListener('drop', (e) => {
            if (e.target.classList.contains('team-zone') || e.target.closest('.team-zone')) {
                e.preventDefault();
                const zone = e.target.classList.contains('team-zone') ? e.target : e.target.closest('.team-zone');
                zone.style.background = '';
                
                if (draggedElement) {
                    const team = zone.dataset.team;
                    if (team === 'A') {
                        draggedElement.style.border = '2px solid #ff4444';
                        draggedElement.style.background = '#4a1f1f';
                    } else if (team === 'B') {
                        draggedElement.style.border = '2px solid #4444ff';
                        draggedElement.style.background = '#1f1f4a';
                    } else {
                        draggedElement.style.border = '2px solid #666';
                        draggedElement.style.background = '#333';
                    }
                    
                    zone.appendChild(draggedElement);
                }
            }
        });
    }

    function createGameInterface(data) {
        console.log('Creando interfaz de juego');
        const isTeamMode = data.gameMode === 'teams' || data.gameMode === 'ctf';
        
        document.body.innerHTML = `
        <div id="game-container" style="display: flex; height: 100vh; background: #1a1a1a;">
            ${isTeamMode ? `
            <div id="team-a-sidebar" style="width: 150px; background: #2a1a1a; padding: 10px; border-right: 3px solid #ff4444;">
                <h3 style="color: #ff4444; text-align: center; margin: 0 0 10px 0; font-size: 14px;">Equipo A</h3>
                <div id="team-a-players"></div>
            </div>
            ` : ''}
            
            <div id="game-area" style="flex: 1; display: flex; flex-direction: column;">
                <canvas id="game-canvas" width="1200" height="600" style="background:#0d5017; flex: 1; border: none;"></canvas>
                
                <div id="chat-container" style="height: 200px; background: #1a1a1a; border-top: 2px solid #444; display: flex; flex-direction: column;">
                    <div id="chat-header" style="background: #333; padding: 8px; color: white; font-weight: bold; font-size: 14px;">
                        Chat ${isTeamMode ? '(Equipo)' : '(Todos)'}
                        ${data.voiceChat ? '<span id="voice-status" style="float: right; color: #4f4;">🎤 ON</span>' : ''}
                    </div>
                    <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 10px; color: white; font-size: 12px; font-family: monospace;"></div>
                    ${data.textChat ? `
                    <div id="chat-input-container" style="display: flex; padding: 5px; background: #2a2a2a;">
                        <input type="text" id="chat-input" placeholder="Escribe un mensaje..." style="flex: 1; padding: 8px; border: 1px solid #666; border-radius: 3px; background: #1a1a1a; color: white;">
                        <button id="chat-send" style="margin-left: 5px; padding: 8px 15px; background: #4444ff; color: white; border: none; border-radius: 3px; cursor: pointer;">Enviar</button>
                    </div>
                    ` : ''}
                </div>
            </div>
            
            ${isTeamMode ? `
            <div id="team-b-sidebar" style="width: 150px; background: #1a1a2a; padding: 10px; border-left: 3px solid #4444ff;">
                <h3 style="color: #4444ff; text-align: center; margin: 0 0 10px 0; font-size: 14px;">Equipo B</h3>
                <div id="team-b-players"></div>
            </div>
            ` : ''}
        </div>
        `;
        
        if (data.textChat) {
            setupChat();
        }
        
        if (data.voiceChat) {
            voiceChat.enabled = true;
            initVoiceChat(isTeamMode);
        }
        
        if (isTeamMode && data.teams) {
            updateTeamSidebars(data);
        }
    }

    function setupChat() {
        const chatInput = document.getElementById('chat-input');
        const chatSend = document.getElementById('chat-send');
        const chatMessages = document.getElementById('chat-messages');
        
        if (!chatInput || !chatSend) return;
        
        function sendMessage() {
            const message = chatInput.value.trim();
            if (message) {
                socket.emit('chatMessage', {
                    roomId: window._roomId,
                    message: message,
                    timestamp: Date.now()
                });
                chatInput.value = '';
            }
        }
        
        chatSend.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        socket.on('chatMessage', (data) => {
            if (!chatMessages) return;
            
            const messageDiv = document.createElement('div');
            messageDiv.style.marginBottom = '8px';
            messageDiv.style.padding = '4px';
            messageDiv.style.borderRadius = '3px';
            messageDiv.style.background = 'rgba(255,255,255,0.05)';
            
            const time = new Date(data.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            messageDiv.innerHTML = `<span style="color: #888; font-size: 10px;">[${time}]</span> <span style="color: #4CAF50; font-weight: bold;">${data.username}:</span> <span style="color: #fff;">${data.message}</span>`;
            
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });
    }

    function updateTeamSidebars(data) {
        const teamADiv = document.getElementById('team-a-players');
        const teamBDiv = document.getElementById('team-b-players');
        
        if (teamADiv && data.bolas) {
            const teamAPlayers = data.bolas.filter(p => p.team === 0);
            teamADiv.innerHTML = teamAPlayers.map(player => `
                <div style="
                    background: #333; 
                    color: white; 
                    padding: 8px; 
                    margin: 3px 0; 
                    border-radius: 3px; 
                    font-size: 12px; 
                    border-left: 3px solid #ff4444;
                    ${player.alive ? '' : 'opacity: 0.5; text-decoration: line-through;'}
                ">
                    ${player.username}
                    ${player.alive ? '●' : '💀'}
                </div>
            `).join('');
        }
    }

    // MEJORA: Función de inicialización optimizada
    function iniciarJuego(data) {
        console.log('Iniciando juego con datos:', data);
        canvas = document.getElementById('game-canvas');
        ctx = canvas.getContext('2d');
        
        // Inicializar estado del juego
        gameState = {
            bolas: data.bolas,
            turno: data.turno,
            hoyos: data.hoyos,
            gameMode: data.gameMode,
            teams: data.teams,
            bases: data.bases || [],
            flags: data.flags || []
        };

        // Inicializar estelas para cada bola
        gameState.bolas.forEach(bola => {
            ballTrails.set(bola.id, []);
        });

        // Resetear variables de control
        eligiendoAngulo = false;
        cargandoFuerza = false;
        enTiro = false;
        angulo = 0;
        fuerzaActual = 50;
        fuerzaSube = true;

        updateTurnState();
        
        // MEJORA: Configuración de tracking de mouse optimizada
        setupMouseTracking();
        
        // Ajustar tamaño del canvas
        function resizeCanvas() {
            const container = document.getElementById('game-area');
            const chatHeight = 200;
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight - chatHeight;
            
            // Reinicializar posición del mouse
            mouseState.x = canvas.width / 2;
            mouseState.y = canvas.height / 2;
            mouseState.lastValidX = mouseState.x;
            mouseState.lastValidY = mouseState.y;
        }
        
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        setupGameControls();
        
        // MEJORA: Loop de juego optimizado
        gameLoopRunning = true;
        requestAnimationFrame(gameLoop);
        
        console.log('Juego inicializado correctamente');
    }

    // MEJORA: Tracking de mouse completamente reescrito
    function setupMouseTracking() {
        if (!canvas) return;
        
        // Función para convertir coordenadas de pantalla a mundo
        function updateWorldPosition(screenX, screenY) {
            mouseState.worldX = screenX + camera.x - canvas.width/2;
            mouseState.worldY = screenY + camera.y - canvas.height/2;
        }
        
        // Eventos de mouse principales
        canvas.addEventListener('mouseenter', () => {
            mouseState.insideCanvas = true;
        });
        
        canvas.addEventListener('mouseleave', () => {
            mouseState.insideCanvas = false;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseState.x = (e.clientX - rect.left) * (canvas.width / rect.width);
            mouseState.y = (e.clientY - rect.top) * (canvas.height / rect.height);
            mouseState.lastValidX = mouseState.x;
            mouseState.lastValidY = mouseState.y;
            mouseState.insideCanvas = true;
            
            updateWorldPosition(mouseState.x, mouseState.y);
            
            // Actualizar ángulo si estamos eligiendo dirección
            if (eligiendoAngulo && isMyTurn && gameState) {
                const currentPlayer = gameState.bolas[gameState.turno];
                if (currentPlayer) {
                    angulo = Math.atan2(currentPlayer.y - mouseState.worldY, currentPlayer.x - mouseState.worldX);
                }
            }
        });
        
        // Eventos táctiles para móviles
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        function handleTouchStart(e) {
            e.preventDefault();
            if (e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                mouseState.x = (touch.clientX - rect.left) * (canvas.width / rect.width);
                mouseState.y = (touch.clientY - rect.top) * (canvas.height / rect.height);
                updateWorldPosition(mouseState.x, mouseState.y);
                
                // Simular click para iniciar tiro
                handleShootStart();
            }
        }
        
        function handleTouchMove(e) {
            e.preventDefault();
            if (e.touches.length === 1 && eligiendoAngulo && isMyTurn) {
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                mouseState.x = (touch.clientX - rect.left) * (canvas.width / rect.width);
                mouseState.y = (touch.clientY - rect.top) * (canvas.height / rect.height);
                updateWorldPosition(mouseState.x, mouseState.y);
                
                const currentPlayer = gameState.bolas[gameState.turno];
                if (currentPlayer) {
                    angulo = Math.atan2(currentPlayer.y - mouseState.worldY, currentPlayer.x - mouseState.worldX);
                }
            }
        }
        
        function handleTouchEnd(e) {
            e.preventDefault();
            if (eligiendoAngulo && isMyTurn) {
                eligiendoAngulo = false;
                cargandoFuerza = true;
                fuerzaActual = fuerzaMin;
                fuerzaSube = true;
            } else if (cargandoFuerza && isMyTurn) {
                executeShoot();
            }
        }
    }

    // MEJORA: Configuración de controles de juego separada
    function setupGameControls() {
        if (!canvas) return;
        
        // Click del mouse para iniciar tiro
        canvas.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handleShootStart();
        });
        
        canvas.addEventListener('pointerup', (e) => {
            e.preventDefault();
            if (eligiendoAngulo && isMyTurn) {
                eligiendoAngulo = false;
                cargandoFuerza = true;
                fuerzaActual = fuerzaMin;
                fuerzaSube = true;
            }
        });
        
        // Click para ejecutar tiro
        canvas.addEventListener('click', (e) => {
            e.preventDefault();
            if (cargandoFuerza && isMyTurn) {
                executeShoot();
            }
        });
        
        // Atajos de teclado mejorados
        document.addEventListener('keydown', handleKeyPress);
        
        // Animación de la barra de fuerza
        setInterval(() => {
            if (cargandoFuerza && isMyTurn && gameLoopRunning) {
                if (fuerzaSube) {
                    fuerzaActual += 4;
                    if (fuerzaActual >= fuerzaMax) {
                        fuerzaActual = fuerzaMax;
                        fuerzaSube = false;
                    }
                } else {
                    fuerzaActual -= 4;
                    if (fuerzaActual <= fuerzaMin) {
                        fuerzaActual = fuerzaMin;
                        fuerzaSube = true;
                    }
                }
            }
        }, 50);
    }
    
    function handleShootStart() {
        if (!isMyTurn || enTiro || eligiendoAngulo || cargandoFuerza) return;
        
        const currentPlayer = gameState?.bolas?.[gameState.turno];
        if (!currentPlayer || currentPlayer.id !== window._mySocketId || !currentPlayer.alive) return;
        
        eligiendoAngulo = true;
        angulo = Math.atan2(currentPlayer.y - mouseState.worldY, currentPlayer.x - mouseState.worldX);
        console.log('Iniciando selección de ángulo');
    }
    
    function executeShoot() {
        if (!cargandoFuerza || !isMyTurn) return;
        
        cargandoFuerza = false;
        enTiro = true;
        isMyTurn = false; // Prevenir múltiples tiros
        
        console.log('Ejecutando tiro con fuerza:', fuerzaActual);
        
        socket.emit('shoot', {
            roomId: window._roomId,
            angulo,
            fuerza: fuerzaActual
        });
    }
    
    function handleKeyPress(e) {
        if (!isMyTurn) return;
        
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                if (cargandoFuerza) {
                    executeShoot();
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                resetShootState();
                break;
                
            case 'KeyR':
                e.preventDefault();
                if (!eligiendoAngulo && !cargandoFuerza && !enTiro) {
                    // Tiro rápido hacia el mouse
                    handleShootStart();
                    setTimeout(() => {
                        if (eligiendoAngulo) {
                            eligiendoAngulo = false;
                            cargandoFuerza = true;
                            fuerzaActual = fuerzaMin + (fuerzaMax - fuerzaMin) * 0.6; // 60% de fuerza
                            setTimeout(() => {
                                if (cargandoFuerza) executeShoot();
                            }, 100);
                        }
                    }, 50);
                }
                break;
        }
    }
    
    function resetShootState() {
        eligiendoAngulo = false;
        cargandoFuerza = false;
        enTiro = false;
        console.log('Estado de tiro reseteado');
    }

    // MEJORA: Función de actualización de estado optimizada
    function updateGameState(state) {
        if (!gameState || !state?.bolas) return;
        
        // Guardar estado anterior del turno
        const oldTurno = gameState.turno;
        
        // Actualizar posiciones y estelas de manera eficiente
        state.bolas.forEach((newBola, i) => {
            const oldBola = gameState.bolas[i];
            if (!oldBola) return;
            
            // Calcular distancia movida
            const dx = newBola.x - oldBola.x;
            const dy = newBola.y - oldBola.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Actualizar estela solo si se movió significativamente
            if (distance > 1.5 && newBola.alive) {
                let trail = ballTrails.get(newBola.id) || [];
                
                // Agregar nuevo punto solo si es suficientemente diferente del último
                const lastPoint = trail[trail.length - 1];
                if (!lastPoint || Math.hypot(newBola.x - lastPoint.x, newBola.y - lastPoint.y) > 3) {
                    trail.push({
                        x: newBola.x,
                        y: newBola.y,
                        alpha: 1.0,
                        timestamp: Date.now()
                    });
                    
                    // Limitar longitud de estela
                    if (trail.length > 25) {
                        trail.shift();
                    }
                }
                
                ballTrails.set(newBola.id, trail);
            }
            
            // Actualizar datos de la bola
            Object.assign(oldBola, newBola);
        });
        
        // Actualizar otros datos del estado
        gameState.turno = state.turno;
        if (state.flags) gameState.flags = state.flags;
        if (state.turnTimer !== undefined) gameState.turnTimer = state.turnTimer;
        
        // Si cambió el turno, resetear estado
        if (oldTurno !== state.turno) {
            console.log('Cambio de turno:', gameState.bolas[oldTurno]?.username, '->', gameState.bolas[state.turno]?.username);
            resetShootState();
            updateTurnState();
        }
        
        // Actualizar sidebars si es modo equipos
        if ((gameState.gameMode === 'teams' || gameState.gameMode === 'ctf') && state.bolas) {
            updateTeamSidebars({ bolas: state.bolas });
        }
        
        // Limpiar estelas antiguas de manera eficiente
        cleanupTrails();
    }
    
    // MEJORA: Limpieza de estelas optimizada
    function cleanupTrails() {
        const now = Date.now();
        ballTrails.forEach((trail, ballId) => {
            let hasChanges = false;
            
            // Desvanecer puntos y filtrar en una sola pasada
            for (let i = trail.length - 1; i >= 0; i--) {
                const point = trail[i];
                const age = now - point.timestamp;
                const newAlpha = Math.max(0, 1 - (age / 2500)); // 2.5 segundos
                
                if (newAlpha !== point.alpha) {
                    point.alpha = newAlpha;
                    hasChanges = true;
                }
                
                if (point.alpha <= 0.05) {
                    trail.splice(i, 1);
                    hasChanges = true;
                }
            }
            
            if (hasChanges) {
                ballTrails.set(ballId, trail);
            }
        });
    }

    // MEJORA: Loop de juego optimizado con control de FPS
    let lastFrameTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    
    function gameLoop(currentTime) {
        if (!gameLoopRunning) return;
        
        const deltaTime = currentTime - lastFrameTime;
        
        if (deltaTime >= frameInterval) {
            dibujar();
            lastFrameTime = currentTime;
        }
        
        requestAnimationFrame(gameLoop);
    }

    // MEJORA: Función de dibujo optimizada con mejor rendimiento
    function dibujar() {
        if (!gameState || !canvas || !ctx) return;
        
        // Actualizar cámara suavemente
        const currentPlayer = gameState.bolas[gameState.turno];
        if (currentPlayer?.alive) {
            const targetX = currentPlayer.x;
            const targetY = currentPlayer.y;
            
            // Interpolación suave de cámara
            const lerpFactor = 0.1;
            camera.x += (targetX - camera.x) * lerpFactor;
            camera.y += (targetY - camera.y) * lerpFactor;
        }
        
        // Limitar cámara a los bordes del mundo
        camera.x = Math.max(canvas.width/2, Math.min(WORLD_WIDTH - canvas.width/2, camera.x));
        camera.y = Math.max(canvas.height/2, Math.min(WORLD_HEIGHT - canvas.height/2, camera.y));

        // Limpiar canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Fondo mejorado con patrón
        drawBackground();
        
        // Dibujar elementos del juego en orden correcto
        drawWorldBorders();
        drawHoles();
        drawBases();
        drawFlags();
        drawTrails();
        drawBalls();
        drawCue();
        drawAimingLine();
        drawPowerBar();
        drawUI();
    }
    
    function drawBackground() {
        // Fondo sólido
        ctx.fillStyle = '#0d5017';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    function drawWorldBorders() {
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 20;
        ctx.strokeRect(
            -camera.x + canvas.width/2,
            -camera.y + canvas.height/2,
            WORLD_WIDTH,
            WORLD_HEIGHT
        );
    }
    
    function drawHoles() {
        gameState.hoyos.forEach(hoyo => {
            const x = hoyo.x - camera.x + canvas.width/2;
            const y = hoyo.y - camera.y + canvas.height/2;
            
            // Sombra
            ctx.beginPath();
            ctx.arc(x + 3, y + 3, hoyo.radio, 0, 2*Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fill();
            
            // Hoyo principal con gradiente
            const gradient = ctx.createRadialGradient(x, y, 0, x, y, hoyo.radio);
            gradient.addColorStop(0, '#000');
            gradient.addColorStop(0.7, '#111');
            gradient.addColorStop(1, '#333');
            
            ctx.beginPath();
            ctx.arc(x, y, hoyo.radio, 0, 2*Math.PI);
            ctx.fillStyle = gradient;
            ctx.fill();
            
            // Borde
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 3;
            ctx.stroke();
        });
    }
    
    function drawBases() {
        if (!gameState.bases) return;
        
        gameState.bases.forEach(base => {
            const x = base.x - camera.x + canvas.width/2;
            const y = base.y - camera.y + canvas.height/2;
            
            // Base exterior
            ctx.beginPath();
            ctx.arc(x, y, base.radio, 0, 2*Math.PI);
            ctx.fillStyle = base.color + '22';
            ctx.fill();
            
            // Base interior
            ctx.beginPath();
            ctx.arc(x, y, base.radio - 15, 0, 2*Math.PI);
            ctx.fillStyle = base.color + '44';
            ctx.fill();
            
            // Borde
            ctx.strokeStyle = base.color;
            ctx.lineWidth = 4;
            ctx.stroke();
        });
    }
    
    function drawFlags() {
        if (!gameState.flags) return;
        
        gameState.flags.forEach(flag => {
            const x = flag.x - camera.x + canvas.width/2;
            const y = flag.y - camera.y + canvas.height/2;
            
            // Asta
            ctx.strokeStyle = '#654321';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x, y-30);
            ctx.lineTo(x, y+20);
            ctx.stroke();
            
            // Bandera ondulante con animación
            const wave = Math.sin(Date.now() * 0.005) * 3;
            ctx.fillStyle = flag.color;
            ctx.beginPath();
            ctx.moveTo(x, y-30);
            ctx.lineTo(x + 30 + wave, y-25);
            ctx.lineTo(x + 25 + wave, y-20);
            ctx.lineTo(x + 30 + wave, y-15);
            ctx.lineTo(x, y-10);
            ctx.closePath();
            ctx.fill();
            
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.stroke();
        });
    }
    
    function drawTrails() {
        ballTrails.forEach((trail, ballId) => {
            if (trail.length < 2) return;
            
            ctx.globalCompositeOperation = 'screen';
            
            for (let i = 0; i < trail.length - 1; i++) {
                const point = trail[i];
                const nextPoint = trail[i + 1];
                const opacity = (i / trail.length) * point.alpha * 0.8;
                
                if (opacity <= 0.05) continue;
                
                const x1 = point.x - camera.x + canvas.width/2;
                const y1 = point.y - camera.y + canvas.height/2;
                const x2 = nextPoint.x - camera.x + canvas.width/2;
                const y2 = nextPoint.y - camera.y + canvas.height/2;
                
                // Estela mágica mejorada
                const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
                gradient.addColorStop(0, `rgba(255, 215, 0, ${opacity * 0.6})`);
                gradient.addColorStop(0.3, `rgba(138, 43, 226, ${opacity * 0.8})`);
                gradient.addColorStop(0.7, `rgba(75, 0, 130, ${opacity * 0.9})`);
                gradient.addColorStop(1, `rgba(0, 191, 255, ${opacity * 0.7})`);
                
                ctx.strokeStyle = gradient;
                ctx.lineWidth = 10 * opacity;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                
                // Núcleo brillante
                ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
                ctx.lineWidth = 3 * opacity;
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
                
                // Partículas ocasionales
                if (i % 3 === 0 && Math.random() < opacity) {
                    const sparkleX = x1 + (x2 - x1) * Math.random();
                    const sparkleY = y1 + (y2 - y1) * Math.random();
                    
                    ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
                    ctx.beginPath();
                    ctx.arc(sparkleX + (Math.random() - 0.5) * 6, sparkleY + (Math.random() - 0.5) * 6, 1.5, 0, 2*Math.PI);
                    ctx.fill();
                }
            }
            
            ctx.globalCompositeOperation = 'source-over';
        });
    }
    
    function drawBalls() {
        const colores = ['#ff4444','#4444ff','#44ff44','#ffff44','#ff44ff','#44ffff','#ff8844','#8844ff'];
        
        gameState.bolas.forEach((bola, i) => {
            if (!bola.alive) return;
            
            const x = bola.x - camera.x + canvas.width/2;
            const y = bola.y - camera.y + canvas.height/2;
            
            // Sombra
            ctx.beginPath();
            ctx.arc(x + 4, y + 4, bola.radio, 0, 2*Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fill();
            
            // Bola principal
            ctx.beginPath();
            ctx.arc(x, y, bola.radio, 0, 2*Math.PI);
            ctx.fillStyle = colores[bola.color] || colores[i % colores.length];
            ctx.fill();
            
            // Contorno de equipo
            if (gameState.gameMode === 'teams' || gameState.gameMode === 'ctf') {
                ctx.strokeStyle = bola.team === 0 ? '#ff4444' : '#4444ff';
                ctx.lineWidth = 3;
                ctx.stroke();
            } else {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            
            // Dibujar bandera si el jugador la tiene (modo CTF)
            if (gameState.gameMode === 'ctf' && bola.hasFlag) {
                const flagTeam = bola.team === 0 ? 1 : 0;
                const flagColor = flagTeam === 0 ? '#ff4444' : '#4444ff';
                
                // Dibujamos la bandera sobre el jugador
                ctx.save();
                ctx.translate(x, y - bola.radio - 15);
                
                // Asta de la bandera
                ctx.strokeStyle = '#654321';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(0, -15);
                ctx.stroke();
                
                // Bandera
                const wave = Math.sin(Date.now() * 0.005) * 2;
                ctx.fillStyle = flagColor;
                ctx.beginPath();
                ctx.moveTo(0, -15);
                ctx.lineTo(15 + wave, -12);
                ctx.lineTo(12 + wave, -9);
                ctx.lineTo(15 + wave, -6);
                ctx.lineTo(0, -3);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.stroke();
                
                ctx.restore();
            }
            
            // Brillo realista
            const highlight = ctx.createRadialGradient(
                x - bola.radio/3, y - bola.radio/3, 0,
                x, y, bola.radio
            );
            highlight.addColorStop(0, 'rgba(255,255,255,0.5)');
            highlight.addColorStop(0.6, 'rgba(255,255,255,0.2)');
            highlight.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = highlight;
            ctx.fill();
            
            // Nombre del jugador con mejor legibilidad
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(x - 25, y - bola.radio - 25, 50, 16);
            ctx.fillStyle = 'white';
            ctx.fillText(bola.username, x, y - bola.radio - 12);
            
            // Indicador de turno mejorado
            if (gameState.turno === i) {
                const pulseSize = 5 + Math.sin(Date.now() * 0.01) * 3;
                ctx.strokeStyle = '#ffff00';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.beginPath();
                ctx.arc(x, y, bola.radio + pulseSize, 0, 2*Math.PI);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        });
    }
    
    function drawCue() {
        if (!isMyTurn || enTiro || !gameState) return;
        
        const currentPlayer = gameState.bolas[gameState.turno];
        if (!currentPlayer?.alive) return;
        
        const playerScreenX = currentPlayer.x - camera.x + canvas.width/2;
        const playerScreenY = currentPlayer.y - camera.y + canvas.height/2;
        
        const targetMouseX = mouseState.insideCanvas ? mouseState.x : mouseState.lastValidX;
        const targetMouseY = mouseState.insideCanvas ? mouseState.y : mouseState.lastValidY;
        
        if (!eligiendoAngulo && !cargandoFuerza) {
            const tacoAngle = Math.atan2(targetMouseY - playerScreenY, targetMouseX - playerScreenX);
            const tacoDistance = currentPlayer.radio + 70;
            const tacoX = playerScreenX + Math.cos(tacoAngle) * tacoDistance;
            const tacoY = playerScreenY + Math.sin(tacoAngle) * tacoDistance;
            
            // Sombra del taco
            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.shadowBlur = 8;
            ctx.shadowOffsetX = 3;
            ctx.shadowOffsetY = 3;
            
            // Mango
            ctx.strokeStyle = '#8B4513';
            ctx.lineWidth = 10;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(tacoX, tacoY);
            ctx.lineTo(tacoX + Math.cos(tacoAngle) * 50, tacoY + Math.sin(tacoAngle) * 50);
            ctx.stroke();
            
            // Punta
            ctx.strokeStyle = '#654321';
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(tacoX, tacoY);
            ctx.lineTo(tacoX + Math.cos(tacoAngle) * 20, tacoY + Math.sin(tacoAngle) * 20);
            ctx.stroke();
            
            ctx.restore();
            
            // Línea de ayuda animada
            ctx.setLineDash([8, 6]);
            ctx.strokeStyle = `rgba(255,255,255,${0.4 + Math.sin(Date.now() * 0.01) * 0.2})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playerScreenX, playerScreenY);
            ctx.lineTo(playerScreenX + Math.cos(tacoAngle) * 100, playerScreenY + Math.sin(tacoAngle) * 100);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }
    
    function drawAimingLine() {
        if (!eligiendoAngulo || !isMyTurn) return;
        
        const currentPlayer = gameState.bolas[gameState.turno];
        if (!currentPlayer) return;
        
        const x = currentPlayer.x - camera.x + canvas.width/2;
        const y = currentPlayer.y - camera.y + canvas.height/2;
        const endX = x + Math.cos(angulo + Math.PI) * 120;
        const endY = y + Math.sin(angulo + Math.PI) * 120;
        
        // Línea principal
        ctx.strokeStyle = '#ffff00';
        ctx.lineWidth = 4;
        ctx.setLineDash([12, 8]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        // Línea interna
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        
        ctx.setLineDash([]);
    }
    
    function drawPowerBar() {
        if (!cargandoFuerza || !isMyTurn) return;
        
        const barWidth = 320;
        const barHeight = 30;
        const barX = canvas.width/2 - barWidth/2;
        const barY = canvas.height - 100;
        
        // Fondo con gradiente
        const bgGradient = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
        bgGradient.addColorStop(0, 'rgba(0,150,0,0.9)');
        bgGradient.addColorStop(0.5, 'rgba(150,150,0,0.9)');
        bgGradient.addColorStop(1, 'rgba(150,0,0,0.9)');
        ctx.fillStyle = bgGradient;
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Barra de fuerza actual
        const fuerzaNormalizada = (fuerzaActual - fuerzaMin) / (fuerzaMax - fuerzaMin);
        const fillWidth = barWidth * fuerzaNormalizada;
        
        const forceGradient = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
        if (fuerzaNormalizada < 0.3) {
            forceGradient.addColorStop(0, '#00ff00');
            forceGradient.addColorStop(1, '#66ff00');
        } else if (fuerzaNormalizada < 0.7) {
            forceGradient.addColorStop(0, '#66ff00');
            forceGradient.addColorStop(1, '#ffff00');
        } else {
            forceGradient.addColorStop(0, '#ffff00');
            forceGradient.addColorStop(1, '#ff0000');
        }
        
        ctx.fillStyle = forceGradient;
        ctx.fillRect(barX, barY, fillWidth, barHeight);
        
        // Indicador animado
        const indicatorX = barX + fillWidth;
        const pulse = 2 + Math.sin(Date.now() * 0.02) * 1;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(indicatorX - 6 - pulse, barY - 8);
        ctx.lineTo(indicatorX + 6 + pulse, barY - 8);
        ctx.lineTo(indicatorX, barY);
        ctx.closePath();
        ctx.fill();
        
        // Marco de la barra
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Texto de fuerza
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText('FUERZA', canvas.width/2, barY - 15);
        
        // Porcentaje
        const percentage = Math.round(fuerzaNormalizada * 100);
        ctx.font = 'bold 16px Arial';
        ctx.fillText(`${percentage}%`, canvas.width/2, barY + barHeight + 25);
        
        // Resetear sombra
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
    }
    
    function drawUI() {
        if (!gameState?.bolas?.[gameState.turno]) return;
        
        const currentPlayer = gameState.bolas[gameState.turno];
        
        // Panel de información del turno
        const panelWidth = 280;
        const panelHeight = 100;
        const panelX = 15;
        const panelY = 15;
        
        // Fondo del panel con gradiente
        const panelGradient = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelHeight);
        panelGradient.addColorStop(0, 'rgba(0,0,0,0.8)');
        panelGradient.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = panelGradient;
        ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
        
        // Mostrar timer cuando quedan 15 segundos o menos
        if (gameState.turnTimer <= 15) {
            ctx.fillStyle = gameState.turnTimer <= 5 ? '#ff4444' : '#ffaa00';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`${Math.ceil(gameState.turnTimer)}s`, 25, 45);
        }
        
        // Borde del panel
        ctx.strokeStyle = isMyTurn ? '#00ff00' : '#666';
        ctx.lineWidth = 2;
        ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);
        
        // Información del turno y timer
        ctx.fillStyle = 'white';
        ctx.font = 'bold 18px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`Turno: ${currentPlayer.username}`, panelX + 15, panelY + 30);

        // Mostrar timer cuando quedan 15 segundos o menos
        if (gameState.turnTimer <= 15) {
            ctx.fillStyle = gameState.turnTimer <= 5 ? '#ff4444' : '#ffaa00';
            ctx.font = 'bold 24px Arial';
            ctx.textAlign = 'left';
            ctx.fillText(`${Math.ceil(gameState.turnTimer)}s`, 25, 45);
        }
        
        // Estado del jugador
        if (isMyTurn) {
            ctx.fillStyle = '#00ff00';
            ctx.font = 'bold 16px Arial';
            ctx.fillText('¡TU TURNO!', panelX + 15, panelY + 55);
            
            // Instrucciones según el estado
            ctx.fillStyle = '#ffff00';
            ctx.font = '12px Arial';
            if (!eligiendoAngulo && !cargandoFuerza && !enTiro) {
                ctx.fillText('Click para apuntar', panelX + 15, panelY + 75);
            } else if (eligiendoAngulo) {
                ctx.fillText('Mueve el mouse para apuntar', panelX + 15, panelY + 75);
            } else if (cargandoFuerza) {
                ctx.fillText('Click para disparar (Espacio = tiro rápido)', panelX + 15, panelY + 75);
            }
        } else {
            ctx.fillStyle = '#ffaa00';
            ctx.font = 'bold 16px Arial';
            ctx.fillText('Esperando...', panelX + 15, panelY + 55);
            
            ctx.fillStyle = '#aaa';
            ctx.font = '12px Arial';
            ctx.fillText(`Jugando: ${currentPlayer.username}`, panelX + 15, panelY + 75);
        }
        
        // Contador de jugadores vivos
        const alivePlayers = gameState.bolas.filter(b => b.alive).length;
        const totalPlayers = gameState.bolas.length;
        
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(canvas.width - 150, 15, 130, 40);
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 1;
        ctx.strokeRect(canvas.width - 150, 15, 130, 40);
        
        ctx.fillStyle = 'white';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`Jugadores: ${alivePlayers}/${totalPlayers}`, canvas.width - 85, 40);
        
        // Indicador de conexión
        const connectionStatus = socket.connected ? '🟢' : '🔴';
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(connectionStatus, canvas.width - 20, canvas.height - 20);
    }

    // MEJORA: Función de limpieza optimizada
    function cleanup() {
        console.log('Ejecutando limpieza de recursos');
        gameLoopRunning = false;
        
        // Limpiar estelas
        ballTrails.clear();
        
        // Limpiar audio
        if (voiceChat.localStream) {
            voiceChat.localStream.getTracks().forEach(track => track.stop());
        }
        
        // Resetear variables de chat de voz
        voiceChat.enabled = false;
        voiceChat.localStream = null;
        voiceChat.peers = {};
        
        // Limpiar timers
        if (voiceChat.allChatTimer) {
            clearTimeout(voiceChat.allChatTimer);
        }
        
        console.log('Recursos limpiados correctamente');
    }

    // MEJORA: Función para mostrar notificaciones de juego
    function showGameNotification(title, message, type = 'info', duration = 3000) {
        // Crear elemento de notificación si no existe
        let notification = document.getElementById('game-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'game-notification';
            notification.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                padding: 20px 30px;
                border-radius: 10px;
                font-weight: bold;
                font-size: 16px;
                text-align: center;
                z-index: 2000;
                opacity: 0;
                transition: all 0.3s ease;
                pointer-events: none;
                max-width: 400px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            document.body.appendChild(notification);
        }
        
        // Configurar estilo según el tipo
        switch(type) {
            case 'success':
                notification.style.background = 'rgba(0,255,0,0.9)';
                notification.style.color = 'black';
                break;
            case 'error':
                notification.style.background = 'rgba(255,0,0,0.9)';
                notification.style.color = 'white';
                break;
            case 'warning':
                notification.style.background = 'rgba(255,165,0,0.9)';
                notification.style.color = 'black';
                break;
            default: // info
                notification.style.background = 'rgba(0,150,255,0.9)';
                notification.style.color = 'white';
                break;
        }
        
        // Mostrar notificación
        notification.innerHTML = `<div style="font-size: 18px; margin-bottom: 5px;">${title}</div><div>${message}</div>`;
        notification.style.opacity = '1';
        
        // Auto-ocultar
        setTimeout(() => {
            if (notification) {
                notification.style.opacity = '0';
            }
        }, duration);
    }

    // MEJORA: Función para manejar errores de conexión
    socket.on('connect_error', (error) => {
        console.error('Error de conexión:', error);
        showGameNotification('Error de Conexión', 'No se pudo conectar al servidor', 'error', 5000);
    });

    socket.on('reconnect', (attemptNumber) => {
        console.log('Reconectado después de', attemptNumber, 'intentos');
        showGameNotification('Reconectado', 'Conexión restaurada exitosamente', 'success');
    });

    socket.on('reconnect_failed', () => {
        showGameNotification('Conexión Perdida', 'No se pudo reconectar al servidor', 'error', 10000);
    });

    // MEJORA: Eventos adicionales del servidor
    socket.on('playerJoined', (data) => {
        showGameNotification('Jugador Conectado', `${data.username} se ha unido`, 'info', 2000);
    });

    socket.on('playerLeft', (data) => {
        showGameNotification('Jugador Desconectado', `${data.username} se ha ido`, 'warning', 2000);
    });

    socket.on('turnTimeWarning', (data) => {
        if (isMyTurn) {
            showGameNotification('¡Tiempo!', `Te quedan ${data.seconds} segundos`, 'warning', 1500);
        }
    });

    socket.on('powerUpCollected', (data) => {
        showGameNotification('Power-Up', `${data.player} recogió ${data.type}`, 'success', 2000);
    });

    // MEJORA: Función para detectar dispositivos móviles
    function isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    // MEJORA: Ajustes específicos para móviles
    function setupMobileOptimizations() {
        if (!isMobileDevice()) return;
        
        // Prevenir zoom en doble tap
        document.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        });
        
        let lastTouchEnd = 0;
        document.addEventListener('touchend', function(e) {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                e.preventDefault();
            }
            lastTouchEnd = now;
        }, false);
        
        // Ocultar barra de direcciones en móviles
        setTimeout(() => {
            window.scrollTo(0, 1);
        }, 1000);
        
        console.log('Optimizaciones móviles activadas');
    }

    // MEJORA: Manejo de visibilidad de página para optimizar recursos
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('Página oculta - reduciendo actividad');
            // Reducir frecuencia de actualización cuando la página no es visible
            ballTrails.forEach((trail, ballId) => {
                trail.forEach(point => point.alpha *= 0.8);
            });
        } else {
            console.log('Página visible - restaurando actividad normal');
        }
    });



});
