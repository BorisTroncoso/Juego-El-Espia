const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();

// 🌟 MAGIA PARA EL HOSTING: Esto hace que el servidor entregue tu index.html automáticamente
app.use(express.static(__dirname)); 
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const salas = {};

// Catálogo base (le agregué un par más)
const lugaresBase = [
  "Una Fonda animada por papi miki", "Metro Baquedano", "En Cal y Canto entremedio de una pelea de peruanos y un veneco rapi intentando separarlos","En un baño turco sacando los puntos negros con caca del rafael araneda y don francisco","Conociendo chañaral con el gabinete de Kast","Piscina plastica en un barrio de tacna","En el museo de conchalí, sección historia de los paraderos","En el teatro viendo la obra de la historia de la universidad de chile del libro del manuel","Club de natacion en Bolivia dirigido por evo morales","Porteria de la UTEM consumiendo fentanilo","Primer dia de clases de primer año en la carrera de Publicidad","Revelación de de genero de familia somali","Fiesta de disfraces con tematica de Bob el constructor","En el cine viendo rayas en 3D", "Cafeteria con tematica de delfin hasta el fin", "Tocata punk en la U playa ancha", "Concierto de los Jonas Brothers", "Baño de la Disco", "Estadio Nacional concierto de daddy yankee 2022", "En una tocata de rap con MEO",
  "La Playa de zapallar", "Jumbo en las condes", "Cerro San Cristóbal 1 de noviembre", "En la fila del Consultorio", "En la farmacia doctor simi con don omar",
  "Paradero de Micro en vitacura", "Fantasilandia en halloween", "En la Vega con el waton de la vega", "En la entrada de un motel en barrio franklin", "Comisaría con el loco Rene",
  "Zoológico", "Cine erotico de plaza de armas", "Clinica davila recoleta", "Sinfonica de beethoven con naya facil en primera fila","Tour en el Cementerio General", "Aeropuerto",
  "Mall Plaza Vespucio norte","Plaza de Armas", "En la 210 a las 00:00 un viernes", "En 10 de julio con un trava feo", "En un baño del mcdonalds con diarrea", "En el museo del acordeon en chiloe"
];

io.on('connection', (socket) => {
  console.log('🟢 Alguien se conectó:', socket.id);

  socket.on('crearSala', (nombreJugador) => {
    const codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
    salas[codigoSala] = {
      jugadores: [{ id: socket.id, nombre: nombreJugador }],
      lugaresCustom: [], // Aquí guardaremos los lugares del carrete
      timer: null // Para el cronómetro
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
      // Le avisamos cuántos lugares extra han agregado
      io.to(codigoSala).emit('lugarAgregado', salas[codigoSala].lugaresCustom.length);
    } else {
      socket.emit('errorSala', 'La sala no existe.');
    }
  });

  // 🗺️ Agregar lugar inventado
  socket.on('agregarLugar', ({ codigoSala, lugar }) => {
    if (salas[codigoSala] && lugar.trim() !== '') {
      salas[codigoSala].lugaresCustom.push(lugar);
      io.to(codigoSala).emit('lugarAgregado', salas[codigoSala].lugaresCustom.length);
    }
  });

  // 🎲 Iniciar Partida
  socket.on('empezarJuego', (codigoSala) => {
    const sala = salas[codigoSala];
    if (sala && sala.jugadores.length > 0) {
      
      // Limpiamos el cronómetro por si venimos de otra partida
      if(sala.timer) clearInterval(sala.timer);

      // Mezclamos lugares base + los del carrete, los desordenamos y sacamos solo 20
      let todosLosLugares = [...lugaresBase, ...sala.lugaresCustom];
      todosLosLugares = todosLosLugares.sort(() => 0.5 - Math.random()).slice(0, 20);

      // Sorteamos Espía y Lugar
      const lugarElegido = todosLosLugares[Math.floor(Math.random() * todosLosLugares.length)];
      const espiaObj = sala.jugadores[Math.floor(Math.random() * sala.jugadores.length)];
      
      // Guardamos quién es el espía para mostrarlo al final
      sala.espiaActual = espiaObj.nombre;
      sala.lugarActual = lugarElegido;

      sala.jugadores.forEach(jugador => {
        if (jugador.id === espiaObj.id) {
          io.to(jugador.id).emit('rolAsignado', { rol: 'Espía', lugar: '???' });
        } else {
          io.to(jugador.id).emit('rolAsignado', { rol: 'Normal', lugar: lugarElegido });
        }
      });

      // Mandamos la lista de 20 lugares ordenada alfabéticamente para que se vea bonita
      io.to(codigoSala).emit('juegoIniciado', todosLosLugares.sort());

      // ⏱️ CRONÓMETRO (8 Minutos = 480 segundos)
      let tiempo = 480; 
      sala.timer = setInterval(() => {
        tiempo--;
        io.to(codigoSala).emit('tiempoRestante', tiempo);
        if (tiempo <= 0) {
          clearInterval(sala.timer);
          io.to(codigoSala).emit('finDeJuego', { espia: sala.espiaActual, lugar: sala.lugarActual, motivo: '¡Se acabó el tiempo! Ganó el Espía.' });
        }
      }, 1000); // 1000 ms = 1 segundo
    }
  });

  // 🛑 Fin manual del juego
  socket.on('terminarPartida', (codigoSala) => {
    const sala = salas[codigoSala];
    if (sala) {
      if(sala.timer) clearInterval(sala.timer);
      io.to(codigoSala).emit('finDeJuego', { espia: sala.espiaActual, lugar: sala.lugarActual, motivo: 'Partida detenida por el grupo.' });
    }
  });

  // 🔄 Volver al lobby
  socket.on('volverLobby', (codigoSala) => {
    io.to(codigoSala).emit('regresarLobby');
  });

});

// El puerto ahora es dinámico (necesario para Render)
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor listo en http://localhost:${PORT}`);
});
