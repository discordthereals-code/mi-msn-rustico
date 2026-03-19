const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { 
    cors: { origin: "*" }, 
    maxHttpBufferSize: 5e7 // 50MB para fotos/audios
});

app.use(express.static(__dirname));

let usuarios = {}; 
// Historiales independientes por sala
let roomHistories = {
    "Juegos Online": [],
    "Conversando": [],
    "SoloTodo": []
};

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const { user, pass } = data;
        if (!usuarios[user]) usuarios[user] = pass;
        if (usuarios[user] === pass) {
            socket.userName = user;
            // Al loguear, entra por defecto a 'Conversando'
            socket.join("Conversando");
            socket.currentRoom = "Conversando";
            
            socket.emit('login_status', { 
                success: true, 
                user, 
                history: roomHistories["Conversando"], 
                tema: "SALA: Conversando" 
            });
        } else {
            socket.emit('login_status', { success: false, msg: "❌ Clave incorrecta." });
        }
    });

    // --- LÓGICA DE CAMBIO DE SALA ---
    socket.on('join_room', (newRoom) => {
        if (socket.currentRoom) socket.leave(socket.currentRoom);
        socket.join(newRoom);
        socket.currentRoom = newRoom;
        
        // Enviamos el historial específico de esa sala al usuario que entra
        socket.emit('actualizar_historial', roomHistories[newRoom] || []);
        socket.emit('actualizar_tema', "SALA: " + newRoom);
    });

    socket.on('chat message', (data) => {
        const room = socket.currentRoom || "Conversando";
        
        // Detector de comando /tema (ahora cambia el nombre de la sala actual)
        if (data.text && typeof data.text === 'string' && data.text.toLowerCase().startsWith('/tema ')) {
            const nuevoTema = data.text.substring(6).trim();
            io.to(room).emit('actualizar_tema', "SALA: " + nuevoTema);
            return;
        }

        // Guardar en el historial de la sala correspondiente
        if (!roomHistories[room]) roomHistories[room] = [];
        roomHistories[room].push(data);
        if (roomHistories[room].length > 50) roomHistories[room].shift();

        // Enviar SOLO a los miembros de esa sala
        io.to(room).emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("Servidor MSN Etapa 2 Online"));