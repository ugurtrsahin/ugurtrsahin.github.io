// Simülatörün tarayıcıdan bağımsız katmanlarını (data.js + physics.js) Node'da yükler.
// Dosyalar tarayıcıdaki gibi klasik betik olarak aynı V8 bağlamında sırayla çalıştırılır;
// üst düzey const/let bildirimleri bağlamın ortak sözcüksel kapsamında kalır ve
// ctx.run('ifade') ile okunabilir.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'hplc-sim');

export function loadSim() {
  const context = vm.createContext({ console, Math, Float64Array, Array, Number, Object, JSON });
  for (const f of ['data.js', 'physics.js']) {
    vm.runInContext(readFileSync(join(root, f), 'utf8'), context, { filename: f });
  }
  const run = (code) => vm.runInContext(code, context);
  // Varsayılan durumun derin kopyası: her test temiz başlangıçtan başlar
  const defaults = run('JSON.stringify(S)');
  const reset = () => run(`Object.assign(S, JSON.parse(${JSON.stringify(defaults)}))`);
  return { run, reset, S: run('S') };
}
