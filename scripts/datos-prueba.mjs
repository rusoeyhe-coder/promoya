// Carga contactos de prueba en la base LOCAL (solo para probar en la PC). Emails @ejemplo.test: no existen.
const B = process.argv[2] || 'http://localhost:3900';
const nombres = ['Nico Ferraro','Lucía Vidal','DJ Kraken','Mati Groove','Sofi Bass','Tomi Loop','Juli Deep','Fede Minimal','Caro Techno','Bruno House','Agus Vinyl','Pau Rhythm','Lean Drums','Meli Tech','Santi Acid','Vale Night','Gonza Funk','Rocío Wave','Facu Bounce','Mica Pulse'];
const filas = [];
for (let i = 0; i < 60; i++) {
  const n = nombres[i % nombres.length] + (i >= 20 ? ` ${Math.floor(i / 20) + 1}` : '');
  const user = n.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
  filas.push({ nombre: n, email: `${user}@ejemplo.test`, soundcloud: i % 4 === 3 ? '' : `soundcloud.com/${user}`, tipo: i % 10 === 0 ? 'sello' : 'dj', pais: i % 3 ? 'Argentina' : 'Uruguay', etiquetas: i % 2 ? 'tech house' : 'minimal' });
}
const r = await fetch(`${B}/api/contactos/importar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filas }) });
console.log(await r.json());
