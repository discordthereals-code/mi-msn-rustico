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

let db;

(async () => {
    try {
        db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });

        await db.exec(`
            CREATE TABLE IF NOT EXISTS usuarios (
                user TEXT PRIMARY KEY, 
                pass TEXT, 
                foto TEXT DEFAULT 'https://upload.wikimedia.org/wikipedia/commons/8/89/Portrait_Placeholder.png', 
                descripcion TEXT DEFAULT '¿En qué piensas?', 
                estado TEXT DEFAULT 'Disponible'
            );
            CREATE TABLE IF NOT EXISTS mensajes (
                id INTEGER PRIMARY KEY AUTOINCREMENT, 
                de TEXT, para TEXT, texto TEXT, tipo TEXT, fecha DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ DB Conectada y Limpia.");
    } catch (err) { console.error("❌ Error DB:", err); }
})();

app.use(express.static(__dirname));
let usuariosOnline = {}; 

async function actualizarListas() {
    try {
        const todos = await db.all('SELECT user, foto, descripcion, estado FROM usuarios');
        const listaFinal = todos.map(u => ({ ...u, online: !!usuariosOnline[u.user] }));
        io.emit('lista_contactos', listaFinal);
    } catch(e){ console.log(e); }
}

io.on('connection', (socket) => {
    socket.on('login', async (data) => {
        const { user, pass } = data;
        if(!user || !pass) return;
        let userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [user]);
        if (!userDB) {
            await db.run('INSERT INTO usuarios (user, pass) VALUES (?, ?)', [user, pass]);
            userDB = await db.get('SELECT * FROM usuarios WHERE user = ?', [user]);
        } else if (userDB.pass !== pass) {
            return socket.emit('login_status', { success: false, msg: "Clave incorrecta." });
        }
        socket.userName = user;
        usuariosOnline[user] = socket.id;
        const history = await db.all('SELECT de as user, texto as text, tipo FROM mensajes WHERE para IS NULL ORDER BY id DESC LIMIT 50');
        socket.emit('login_status', { success: true, user, perfil: userDB, history: history.reverse() });
        actualizarListas();
    });

    socket.on('update_profile', async (data) => {
        if(!socket.userName) return;
        if(data.foto) await db.run('UPDATE usuarios SET foto = ? WHERE user = ?', [data.foto, socket.userName]);
        if(data.desc) await db.run('UPDATE usuarios SET descripcion = ? WHERE user = ?', [data.desc, socket.userName]);
        actualizarListas();
    });

    socket.on('chat message', async (data) => {
        if(!socket.userName) return;
        const tipo = data.isBuzz ? 'zumbido' : 'texto';
        const de = socket.userName;
        if (data.to) {
            await db.run('INSERT INTO mensajes (de, para, texto, tipo) VALUES (?,?,?,?)', [de, data.to, data.text || null, tipo]);
            if (usuariosOnline[data.to]) io.to(usuariosOnline[data.to]).emit('chat message', {user: de, text: data.text, isBuzz: data.isBuzz, to: data.to});
            socket.emit('chat message', {user: de, text: data.text, isBuzz: data.isBuzz, to: data.to});
        } else {
            await db.run('INSERT INTO mensajes (de, para, texto, tipo) VALUES (?,NULL,?,?)', [de, data.text || null, tipo]);
            io.emit('chat message', {user: de, text: data.text, isBuzz: data.isBuzz});
        }
    });

    socket.on('disconnect', () => { if (socket.userName) { delete usuariosOnline[socket.userName]; actualizarListas(); } });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log(`🚀 Puerto: ${PORT}`));