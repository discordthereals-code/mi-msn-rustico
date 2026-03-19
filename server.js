const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});
const path = require('path');

// Servir el archivo index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Variables en memoria (se borran si reinicias Render, pero es para que funcione YA)
let chatHistory = [];
let usuarios = {}; 
let canalTema = "BIENVENIDOS A THE REALS";

io.on('connection', (socket) => {
    console.log("🟢 Usuario conectado");

    // ESCUCHAR EL LOGIN
    socket.on('login', (data) => {
        console.log("📥 Intento de login de:", data.user);
        const { user, pass } = data;

        // Si el usuario no existe, lo creamos
        if (!usuarios[user]) {
            usuarios[user] = pass;
            console.log("✨ Usuario nuevo creado:", user);
        }

        // Verificar clave
        if (usuarios[user] === pass) {
            console.log("✅ Login exitoso para:", user);
            socket.emit('login_status', { 
                success: true, 
                user: user, 
                history: chatHistory, 
                tema: canalTema 
            });
        } else {
            console.log("❌ Clave errónea para:", user);
            socket.emit('login_status', { success: false, msg: "Clave incorrecta o usuario ocupado." });
        }
    });

    // ESCUCHAR MENSAJES
    socket.on('chat message', (data) => {
        if (data.text.startsWith('/tema ')) {
            canalTema = data.text.substring(6);
            io.emit('cambiar tema', canalTema);
            return;
        }
        chatHistory.push(data);
        if (chatHistory.length > 50) chatHistory.shift();
        io.emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor THE REALS activo en puerto ${PORT}`);
});