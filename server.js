const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path');
const fs = require('fs');

const DATA_FILE = './mensajes.json';

let chatHistory = [];
let canalTema = "Bienvenidos a THE REALS";

// Cargar datos antiguos si existen
if (fs.existsSync(DATA_FILE)) {
    try {
        const data = fs.readFileSync(DATA_FILE);
        const parsed = JSON.parse(data);
        chatHistory = parsed.history || [];
        canalTema = parsed.tema || "Bienvenidos a THE REALS";
    } catch (e) {
        console.log("Error leyendo archivo de mensajes.");
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
    // Enviamos lo que tenemos guardado al que entra
    socket.emit('cargar historia', { history: chatHistory, tema: canalTema });

    socket.on('chat message', (data) => {
        // --- AQUÍ ESTÁ EL TRUCO DEL TEMA ---
        // Si el texto empieza con /tema (sin importar mayúsculas)
        if (data.text.toLowerCase().startsWith('/tema ')) {
            canalTema = data.text.substring(6); // Corta "/tema " y se queda con el resto
            
            // Avisamos a TODOS que el tema cambió
            io.emit('cambiar tema', canalTema);
            
            // Opcional: Mandar un mensaje de sistema avisando del cambio
            const aviso = { user: "SISTEMA", text: `📢 El tema ha sido cambiado a: ${canalTema}` };
            chatHistory.push(aviso);
            io.emit('chat message', aviso);
            
            guardarTodo();
            return; // Detiene el código aquí para que no se envíe como mensaje normal
        }

        // Si no es un comando, es un mensaje normal
        chatHistory.push(data);
        if (chatHistory.length > 100) chatHistory.shift(); 
        io.emit('chat message', data);
        guardarTodo();
    });
});

function guardarTodo() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ history: chatHistory, tema: canalTema }));
    } catch (e) {
        console.log("Error guardando datos.");
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`THE REALS ONLINE en puerto ${PORT}`);
});