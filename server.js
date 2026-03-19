const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const path = require('path');

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

let chatHistory = [];
let usuarios = {}; 
let canalTema = "BIENVENIDOS A THE REALS";

io.on('connection', (socket) => {
    socket.on('login', (data) => {
        const { user, pass } = data;
        if (!usuarios[user]) usuarios[user] = pass;
        if (usuarios[user] === pass) {
            socket.emit('login_status', { success: true, user, history: chatHistory, tema: canalTema });
        } else {
            socket.emit('login_status', { success: false, msg: "Clave incorrecta." });
        }
    });

    socket.on('chat message', (data) => {
        // El servidor recibe: { user, text, time, audio, isBuzz }
        chatHistory.push(data);
        if (chatHistory.length > 50) chatHistory.shift();
        io.emit('chat message', data); // Lo reenvía a TODOS
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log(`🚀 THE REALS Online` ));