const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database('./msn_database.db');

// 1. Configuración de carpetas (Para que no de "Cannot GET /")
app.use(express.static(__dirname)); 
// Si usas una carpeta llamada 'public', cambia la línea anterior por: app.use(express.static('public'));

// 2. Base de Datos: Crear tablas si no existen
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        user TEXT PRIMARY KEY, 
        pass TEXT, 
        foto TEXT, 
        descripcion TEXT, 
        online INTEGER DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS mensajes (
        user TEXT, 
        destino TEXT, 
        texto TEXT, 
        tipo TEXT, 
        archivo TEXT, 
        isBuzz INTEGER, 
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// 3. Lógica de Sockets
io.on('connection', (socket) => {
    console.log('Alguien se ha conectado');

    // --- LOGIN CON AUTO-REGISTRO ---
    socket.on('login', (data) => {
        if (!data.user || !data.pass) return;

        db.get("SELECT * FROM usuarios WHERE user = ?", [data.user], (err, row) => {
            if (row) {
                // Si el usuario existe, validar contraseña
                if (row.pass === data.pass) {
                    finalizarLogin(socket, row);
                } else {
                    socket.emit('login_status', { success: false, message: "Contraseña incorrecta" });
                }
            } else {
                // Si NO existe, lo creamos automáticamente (MSN Style)
                const nuevoPerfil = {
                    user: data.user,
                    pass: data.pass,
                    descripcion: '¡Hola! Estoy usando MSN',
                    foto: ''
                };
                db.run("INSERT INTO usuarios (user, pass, descripcion, foto, online) VALUES (?, ?, ?, ?, 1)",
                    [nuevoPerfil.user, nuevoPerfil.pass, nuevoPerfil.descripcion, nuevoPerfil.foto], 
                    (err) => {
                        finalizarLogin(socket, nuevoPerfil);
                    }
                );
            }
        });
    });

    function finalizarLogin(socket, perfil) {
        socket.user = perfil.user;
        db.run("UPDATE usuarios SET online = 1 WHERE user = ?", [perfil.user], () => {
            enviarListaContactos();
            socket.emit('login_status', { 
                success: true, 
                user: perfil.user, 
                perfil: { user: perfil.user, descripcion: perfil.descripcion, foto: perfil.foto } 
            });
        });
    }

    // --- ACTUALIZAR PERFIL ---
    socket.on('update_profile', (data) => {
        if (!socket.user) return;
        
        if (data.foto) {
            db.run("UPDATE usuarios SET descripcion = ?, foto = ? WHERE user = ?", 
                [data.desc, data.foto, socket.user], () => enviarListaContactos());
        } else {
            db.run("UPDATE usuarios SET descripcion = ? WHERE user = ?", 
                [data.desc, socket.user], () => enviarListaContactos());
        }
    });

    // --- MENSAJES (SALA Y PRIVADOS) ---
    socket.on('chat message', (msg) => {
        if (!socket.user) return;
        const destino = msg.to || 'conversando';
        
        db.run("INSERT INTO mensajes (user, destino, texto, tipo, archivo, isBuzz) VALUES (?, ?, ?, ?, ?, ?)",
            [socket.user, destino, msg.text, msg.tipo, msg.archivo, msg.isBuzz ? 1 : 0], 
            function(err) {
                // Emitimos a todos. El cliente decidirá si lo muestra según la sala activa.
                io.emit('chat message', { 
                    user: socket.user, 
                    to: destino, 
                    text: msg.text, 
                    tipo: msg.tipo, 
                    archivo: msg.archivo, 
                    isBuzz: msg.isBuzz 
                });
            }
        );
    });

    // --- HISTORIAL INTELIGENTE ---
    socket.on('get_private_history', (target) => {
        if (!socket.user) return;
        
        let query;
        let params;

        // Si es una sala global (Conversando, Juegos, SoloTodo)
        if (['conversando', 'juegos', 'solotodo'].includes(target)) {
            query = "SELECT * FROM mensajes WHERE destino = ? ORDER BY fecha ASC LIMIT 50";
            params = [target];
        } else {
            // Si es un chat privado entre dos usuarios
            query = `
                SELECT * FROM mensajes 
                WHERE (user = ? AND destino = ?) 
                OR (user = ? AND destino = ?) 
                ORDER BY fecha ASC LIMIT 50`;
            params = [socket.user, target, target, socket.user];
        }
        
        db.all(query, params, (err, rows) => {
            socket.emit('actualizar_historial', { target: target, history: rows || [] });
        });
    });

    function enviarListaContactos() {
        db.all("SELECT user, foto, descripcion, online FROM usuarios", [], (err, rows) => {
            io.emit('lista_contactos', rows);
        });
    }

    socket.on('disconnect', () => {
        if (socket.user) {
            db.run("UPDATE usuarios SET online = 0 WHERE user = ?", [socket.user], () => {
                enviarListaContactos();
            });
        }
    });
});

// 4. Iniciar Servidor
const PORT = 3000;
http.listen(PORT, () => { 
    console.log(`-------------------------------------------`);
    console.log(` MSN Messenger corriendo en: http://localhost:${PORT}`);
    console.log(`-------------------------------------------`);
});