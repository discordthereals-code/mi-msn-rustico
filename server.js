const express = require('express');
const app = express();
const http = require('http').Server(app);
// Permitimos 50MB para que las fotos no fallen
const io = require('socket.io')(http, { 
    cors: { origin: "*" }, 
    maxHttpBufferSize: 5e7 
});

app.use(express.static(__dirname));

let chatHistory = [];
let usuarios = {}; 
let canalTema = "BIENVENIDOS A THE REALS"; // Tema por defecto

io.on('connection', (socket) => {
    // Al entrar, le enviamos el tema actual al usuario
    socket.emit('actualizar_tema', canalTema);

    socket.on('login', (data) => {
        const { user, pass } = data;
        if (!usuarios[user]) usuarios[user] = pass;
        if (usuarios[user] === pass) {
            socket.emit('login_status', { success: true, user, history: chatHistory, tema: canalTema });
        } else {
            socket.emit('login_status', { success: false, msg: "❌ Clave incorrecta." });
        }
    });

    socket.on('chat message', (data) => {
        // --- AQUÍ ESTÁ EL TRUCO DEL TEMA ---
        // Verificamos si el mensaje existe y empieza con /tema
        if (data.text && typeof data.text === 'string' && data.text.toLowerCase().startsWith('/tema ')) {
            const nuevoTexto = data.text.substring(6).trim();
            if (nuevoTexto.length > 0) {
                canalTema = nuevoTexto; // Cambiamos la variable global
                io.emit('actualizar_tema', canalTema); // Le avisamos a todos los clientes
                
                // Opcional: dejamos un rastro en el chat
                const aviso = { user: "SISTEMA", text: `📢 Tema cambiado a: ${canalTema}`, time: data.time };
                chatHistory.push(aviso);
                io.emit('chat message', aviso);
                return; // IMPORTANTE: No seguimos procesando para que no se vea el comando como texto
            }
        }

        // Si no es comando, es un mensaje normal, audio o imagen
        chatHistory.push(data);
        if (chatHistory.length > 50) chatHistory.shift();
        io.emit('chat message', data);
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("Servidor THE REALS funcionando con /tema y 50MB"));