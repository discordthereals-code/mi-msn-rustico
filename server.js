const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { 
    cors: { origin: "*" }, 
    maxHttpBufferSize: 5e7 // Soporte para archivos de 50MB
});

app.use(express.static(__dirname));

let usuarios = {}; 
// Historiales separados por sala
let roomHistories = {
    "Conversando": [],
    "Juegos Online": [],
    "SoloTodo": []
};

io.on('connection', (socket) => {
    
    socket.on('login', (data) => {
        const { user, pass } = data;
        if (!usuarios[user]) usuarios[user] = pass;
        if (usuarios[user] === pass) {
            socket.userName = user;
            // Entrar a la sala inicial por defecto
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

    // --- CAMBIO DE SALA SEGURO ---
    socket.on('join_room', (newRoom) => {
        if (socket.currentRoom) {
            socket.leave(socket.currentRoom);
        }
        socket.join(newRoom);
        socket.currentRoom = newRoom;
        
        console.log(`${socket.userName} se movió a ${newRoom}`);
        
        // Enviar historial de la nueva sala y actualizar el título
        socket.emit('actualizar_historial', roomHistories[newRoom] || []);
        socket.emit('actualizar_tema', "SALA: " + newRoom);
    });

    socket.on('chat message', (data) => {
        const room = socket.currentRoom || "Conversando";
        
        // Guardar mensaje en el historial de la sala activa
        if (!roomHistories[room]) roomHistories[room] = [];
        roomHistories[room].push(data);
        if (roomHistories[room].length > 50) roomHistories[room].shift();

        // Enviar SOLO a los usuarios que estén en esa misma sala
        io.to(room).emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("Servidor THE REALS Etapa 2 listo"));