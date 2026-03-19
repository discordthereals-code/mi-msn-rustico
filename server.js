const express = require('express');
const app = express();
const http = require('http').Server(app);
const path = require('path');
const io = require('socket.io')(http, { 
    cors: { origin: "*" }, 
    maxHttpBufferSize: 1e8 
});
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

// --- LÍNEA CRÍTICA PARA ARREGLAR EL "CANNOT GET /" ---
app.use(express.static(path.join(__dirname))); 

let db;

(async () => {
    db = await open({ 
        filename: path.join(__dirname, 'database.sqlite'), 
        driver: sqlite3.Database 
    });
    
    await db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            user TEXT PRIMARY KEY, 
            pass TEXT, 
            foto TEXT DEFAULT 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png', 
            descripcion TEXT DEFAULT '¿En qué piensas?'
        );
        CREATE TABLE IF NOT EXISTS mensajes (
            id INTEGER PRIMARY KEY AUTOINCREMENT, 
            de TEXT, 
            para TEXT, 
            texto TEXT, 
            tipo TEXT, 
            archivo TEXT, 
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
})();

// RUTA PRINCIPAL PARA SERVIR EL INDEX.HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

let onlineUsers = {};

io.on('connection', (socket) => {
    socket.on('login', async (data) => {
        let userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [data.user]);
        if (!userDB) {
            await db.run('INSERT INTO usuarios (user, pass) VALUES (?, ?)', [data.user, data.pass]);
            userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [data.user]);
        } else if (userDB.pass !== data.pass) {
            return socket.emit('login_status', { success: false });
        }

        socket.userName = data.user;
        onlineUsers[data.user] = socket.id;
        
        const history = await db.all("SELECT de as user, texto as text, tipo, archivo FROM mensajes WHERE para IS NULL OR para = 'conversando' ORDER BY id ASC LIMIT 100");
        socket.emit('login_status', { success: true, user: data.user, perfil: userDB, history: history });
        broadcastUserList();
    });

    async function broadcastUserList() {
        const todos = await db.all('SELECT user, foto, descripcion FROM usuarios');
        const listaFinal = todos.map(u => ({
            user: u.user,
            foto: u.foto,
            descripcion: u.descripcion,
            online: !!onlineUsers[u.user]
        }));
        io.emit('lista_contactos', listaFinal);
    }

    socket.on('chat message', async (m) => {
        const tipo = m.isBuzz ? 'zumbido' : (m.tipo || 'texto');
        const destino = m.to || 'conversando';
        await db.run('INSERT INTO mensajes (de, para, texto, tipo, archivo) VALUES (?, ?, ?, ?, ?)', [socket.userName, destino, m.text, tipo, m.archivo]);
        
        const payload = { user: socket.userName, text: m.text, tipo, archivo: m.archivo, to: destino, isBuzz: m.isBuzz };
        if (['conversando', 'juegos', 'solotodo'].includes(destino)) {
            io.emit('chat message', payload);
        } else {
            if (onlineUsers[m.to]) io.to(onlineUsers[m.to]).emit('chat message', payload);
            socket.emit('chat message', payload);
        }
    });

    socket.on('get_private_history', async (target) => {
        let h = (['juegos', 'solotodo'].includes(target)) ?
            await db.all('SELECT de as user, texto as text, tipo, archivo FROM mensajes WHERE para = ? ORDER BY id ASC', [target]) :
            await db.all('SELECT de as user, texto as text, tipo, archivo FROM mensajes WHERE (de=? AND para=?) OR (de=? AND para=?) ORDER BY id ASC', [socket.userName, target, target, socket.userName]);
        socket.emit('actualizar_historial', h);
    });

    socket.on('update_profile', async (data) => {
        if (data.foto) await db.run('UPDATE usuarios SET foto = ? WHERE user = ?', [data.foto, socket.userName]);
        if (data.desc !== undefined) await db.run('UPDATE usuarios SET descripcion = ? WHERE user = ?', [data.desc, socket.userName]);
        broadcastUserList();
    });

    socket.on('disconnect', () => { delete onlineUsers[socket.userName]; broadcastUserList(); });
});

http.listen(process.env.PORT || 3000, '0.0.0.0');