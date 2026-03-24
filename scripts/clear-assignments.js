// Elimina todas las asignaciones cliente→repartidor para poder probar el flujo de cliente nuevo

import { getDb } from '../src/database/connection.js';

const db = getDb();
db.exec('DELETE FROM client_assignments');
console.log('Asignaciones eliminadas. El próximo pedido de cada cliente preguntará el repartidor.');
