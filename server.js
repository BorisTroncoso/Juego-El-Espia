const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static(__dirname)); 



const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const salas = {};

const lugaresBase = [

  "Una Fonda animada por papi miki", "Metro Baquedano", "En Cal y Canto entremedio de una pelea de peruanos y un veneco rapi intentando separarlos","En un baño turco sacando los puntos negros con caca del rafael araneda y don francisco","Conociendo chañaral con el gabinete de Kast","Piscina plastica en un barrio de tacna","En el museo de conchalí, sección historia de los paraderos","En el teatro viendo la obra de la historia de la universidad de chile del libro del manuel","Club de natacion en Bolivia dirigido por evo morales","Porteria de la UTEM consumiendo fentanilo","Primer dia de clases de primer año en la carrera de Publicidad","Revelación de de genero de familia somali","Fiesta de disfraces con tematica de Bob el constructor","En el cine viendo rayas en 3D", "Cafeteria con tematica de delfin hasta el fin", "Tocata punk en la U playa ancha", "Concierto de los Jonas Brothers", "Baño de la Disco", "Estadio Nacional concierto de daddy yankee 2022", "En una tocata de rap con MEO",
  "La Playa de zapallar", "Jumbo en las condes", "Cerro San Cristóbal 1 de noviembre", "En la fila del Consultorio", "En la farmacia doctor simi con don omar",  "Paradero de Micro en vitacura", "Fantasilandia en halloween", "En la Vega con el waton de la vega", "En la entrada de un motel en barrio franklin", "Comisaría con el loco Rene",  "Zoológico", "Cine erotico de plaza de armas", "Clinica davila recoleta", "Sinfonica de beethoven con naya facil en primera fila","Tour en el Cementerio General", "Aeropuerto", "Mall Plaza Vespucio norte","Plaza de Armas", "En la 210 a las 00:00 un viernes", "En 10 de julio con un trava feo", "En un baño del mcdonalds con diarrea", "En el museo del acordeon en chiloe"
];

io.on('connection', (socket) => {
  console.log('🟢 Alguien se conectó:', socket.id);

  socket.on('crearSala', (nombreJugador) => {
    const codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
    salas[codigoSala] = {
      jugadores: [{ id: socket.id, nombre: nombreJugador }],
      lugaresCustom: [], 
      timer: null,
      estado: 'lobby', // NUEVO: Guardamos el estado de la sala
      lugaresJugando: [], // NUEVO: Guardamos los lugares de esta ronda
      espiaActual: '',
      lugarActual: ''
    };
    socket.join(codigoSala);
    socket.emit('salaCreada', codigoSala);
    io.to(codigoSala).emit('actualizarJugadores', salas[codigoSala].jugadores);
  });

  socket.on('unirseSala', ({ codigoSala, nombreJugador }) => {
    if (salas[codigoSala]) {
      salas[codigoSala].jugadores.push({ id: socket.id, nombre: nombreJugador });
      socket.join(codigoSala);
      io.to(codigoSala).emit('actualizarJugadores', salas[codigoSala].jugadores);
      io.to(codigoSala).emit('lugarAgregado', salas[codigoSala].lugaresCustom.length);
    } else {
      socket.emit('errorSala', 'La sala no existe.');
    }
  });

  socket.on('agregarLugar', ({ codigoSala, lugar }) => {
    if (salas[codigoSala] && lugar.trim() !== '') {
      salas[codigoSala].lugaresCustom.push(lugar);
      io.to(codigoSala).emit('lugarAgregado', salas[codigoSala].lugaresCustom.length);
    }
  });

  socket.on('empezarJuego', (codigoSala) => {
    const sala = salas[codigoSala];
    if (sala && sala.jugadores.length > 0) {
      if(sala.timer) clearInterval(sala.timer);

      let todosLosLugares = [...lugaresBase, ...sala.lugaresCustom];
      todosLosLugares = todosLosLugares.sort(() => 0.5 - Math.random()).slice(0, 20);

      const lugarElegido = todosLosLugares[Math.floor(Math.random() * todosLosLugares.length)];
      const espiaObj = sala.jugadores[Math.floor(Math.random() * sala.jugadores.length)];
      
      sala.espiaActual = espiaObj.nombre;
      sala.lugarActual = lugarElegido;
      sala.lugaresJugando = todosLosLugares.sort(); // Lo guardamos en memoria
      sala.estado = 'jugando'; // Cambiamos el estado

      sala.jugadores.forEach(jugador => {
        if (jugador.id === espiaObj.id) {
          io.to(jugador.id).emit('rolAsignado', { rol: 'Espía', lugar: '???' });
        } else {
          io.to(jugador.id).emit('rolAsignado', { rol: 'Normal', lugar: lugarElegido });
        }
      });

      io.to(codigoSala).emit('juegoIniciado', sala.lugaresJugando);

      let tiempo = 300; 
      sala.timer = setInterval(() => {
        tiempo--;
        io.to(codigoSala).emit('tiempoRestante', tiempo);
        if (tiempo <= 0) {
          clearInterval(sala.timer);
          sala.estado = 'lobby';
          io.to(codigoSala).emit('finDeJuego', { espia: sala.espiaActual, lugar: sala.lugarActual, motivo: '¡Se acabó el tiempo! Ganó el Espía.' });
        }
      }, 1000);
    }
  });

  // 🆘 NUEVO: El rescate para los que se van a WhatsApp
  socket.on('mePerdi', ({ codigoSala, nombreJugador }) => {
    const sala = salas[codigoSala];
    if (sala) {
      // Actualizamos su ID por si se desconectó
      const jugador = sala.jugadores.find(j => j.nombre === nombreJugador);
      if (jugador) {
        jugador.id = socket.id;
        socket.join(codigoSala);

        // Si la sala ya está jugando, le mandamos sus datos de emergencia
        if (sala.estado === 'jugando') {
          const miRol = (sala.espiaActual === nombreJugador) ? 'Espía' : 'Normal';
          const miLugar = (miRol === 'Espía') ? '???' : sala.lugarActual;
          
          socket.emit('rolAsignado', { rol: miRol, lugar: miLugar });
          socket.emit('juegoIniciado', sala.lugaresJugando);
        } else {
          // Si sigue en el lobby, le refrescamos la lista
          socket.emit('actualizarJugadores', sala.jugadores);
        }
      }
    }
  });

  socket.on('terminarPartida', (codigoSala) => {
    const sala = salas[codigoSala];
    if (sala) {
      if(sala.timer) clearInterval(sala.timer);
      sala.estado = 'lobby';
      io.to(codigoSala).emit('finDeJuego', { espia: sala.espiaActual, lugar: sala.lugarActual, motivo: 'Partida detenida por el grupo.' });
    }
  });

  socket.on('volverLobby', (codigoSala) => {
    if(salas[codigoSala]) salas[codigoSala].estado = 'lobby';
    io.to(codigoSala).emit('regresarLobby');
  });

  // RUTEO OBLIGATORIO PARA RENDER
  app.get('*', (req, res) => {
    res.sendFile(__dirname + '/index.html');
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
