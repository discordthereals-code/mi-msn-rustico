const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const path = require('path'); // <--- Esto ayuda a Windows a no perderse

// Esta línea es la clave: busca el archivo index.html en la carpeta actual
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

io.on('connection', (socket) => {
  console.log('¡Conexión exitosa!');
  socket.on('chat message', (data) => {
    io.emit('chat message', data);
  });
});

const PORT = process.env.PORT || 3000; 

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});