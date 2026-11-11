import TopHeader from '../components/TopHeader';
import FaqItem from '../components/FaqItem';

export default function Ayuda() {
  return (
    <div className="relative flex min-h-screen w-full flex-col bg-bg-light">
      <TopHeader active="ayuda" showUser />

      <main className="flex flex-1 flex-col items-center p-10">
        <h2 className="mb-5 w-full text-center text-[26px] font-bold">¿En que te ayudamos?</h2>

        <input
          type="text"
          placeholder='Busca por palabra clave ejemplo: "descargar contrato"'
          className="mb-[30px] w-full rounded-[25px] border-none bg-card px-5 py-[15px] text-center text-sm outline-none"
        />

        <section className="mt-5 w-full max-w-[800px]">
          <h3 className="mb-[15px] text-sm font-semibold text-main">Preguntas frecuentes</h3>

          <FaqItem question="¿Cómo descargo un contrato ya completado?">
            Mientras respondes a la entrevista, cada cláusula se marca en rojo, ámbar o verde según qué tan avanzada que la revises antes de firmar. El rojo no significa que la cláusula sea inválida, solo que puede generar una obligación importante, como una penalización o un plazo corto.
          </FaqItem>

          <FaqItem question="¿Cómo cambio mi contraseña?">
            Puedes cambiar tu contraseña en cualquier momento desde tu cuenta:
            <br />
            1. Entra a "Ayuda" y "Cuenta y contraseña", o directamente desde tu perfil (icono de tu cuenta arriba a la derecha).
            <br />
            2. Ingresa tu contraseña actual.
            <br />
            3. Guarda los cambios.
          </FaqItem>

          <FaqItem question="¿Cómo cambio mi contraseña?">
            Ve a Configuración &gt; Cuenta y sigue los pasos indicados.
          </FaqItem>
        </section>

        <div className="mt-10 flex w-full max-w-[800px] items-center justify-between border-t border-[#ddd] pt-5">
          <p className="text-xs text-[#555]">
            <strong className="text-primary">¿No encontraste lo que buscabas?</strong>
            <br />
            Repórtanos el problema y te ayudamos directamente.
          </p>
          <button
            type="button"
            className="cursor-pointer rounded-[20px] bg-primary px-[25px] py-2.5 text-xs font-semibold text-white transition-colors duration-200 hover:bg-primary-dark"
          >
            Reporte de problema
          </button>
        </div>
      </main>
    </div>
  );
}