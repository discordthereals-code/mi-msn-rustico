const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./msn_database.db');

// Crear tablas si no existen
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS usuarios (user TEXT PRIMARY KEY, pass TEXT, foto TEXT, descripcion TEXT, online INTEGER)");
    db.run("CREATE TABLE IF NOT EXISTS mensajes (user TEXT, destino TEXT, texto TEXT, tipo TEXT, archivo TEXT, isBuzz INTEGER, fecha DATETIME DEFAULT CURRENT_TIMESTAMP)");
});

app.use(express.static(__dirname));

io.on('connection', (socket) => {
    
    // LOGIN
    socket.on('login', (data) => {
        db.get("SELECT * FROM usuarios WHERE user = ?", [data.user], (err, row) => {
            if (row && row.pass === data.pass) {
                socket.user = data.user;
                db.run("UPDATE usuarios SET online = 1 WHERE user = ?", [data.user]);
                enviarListaContactos();
                socket.emit('login_status', { success: true, user: row.user, perfil: row });
            } else {
                socket.emit('login_status', { success: false });
            }
        });
    });

    // GUARDAR PERFIL (Esto era lo que faltaba y hacía que fallara el modal)
    socket.on('update_profile', (data) => {
        if (!socket.user) return;
        if (data.foto) {
            db.run("UPDATE usuarios SET descripcion = ?, foto = ? WHERE user = ?", [data.desc, data.foto, socket.user], () => {
                enviarListaContactos();
            });
        } else {
            db.run("UPDATE usuarios SET descripcion = ? WHERE user = ?", [data.desc, socket.user], () => {
                enviarListaContactos();
            });
        }
    });

    // MENSAJES (SALA Y PRIVADOS)
    socket.on('chat message', (msg) => {
        if (!socket.user) return;
        const destino = msg.to || 'conversando';
        
        db.run("INSERT INTO mensajes (user, destino, texto, tipo, archivo, isBuzz) VALUES (?, ?, ?, ?, ?, ?)",
            [socket.user, destino, msg.text, msg.tipo, msg.archivo, msg.isBuzz ? 1 : 0], 
            function(err) {
                // Enviamos a todos (io.emit) y el cliente filtrará si le corresponde verlo
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

    // HISTORIAL (Arreglado para salas globales)
    socket.on('get_private_history', (target) => {
        if (!socket.user) return;
        
        let query;
        let params;

        // Si el destino es una sala global
        if (['conversando', 'juegos', 'solotodo'].includes(target)) {
            query = "SELECT * FROM mensajes WHERE destino = ? ORDER BY fecha ASC LIMIT 50";
            params = [target];
        } else {
            // Si es un chat privado entre dos personas
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

http.listen(3000, () => { console.log('MSN corriendo en puerto 3000'); });