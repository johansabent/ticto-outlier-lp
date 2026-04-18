export default function Rules() {
  const steps = [
    {
      num: 1,
      text: 'Crie sua conta no formulário ao lado',
    },
    {
      num: 2,
      text: 'Deposite seu nome na urna no stand da Ticto',
    },
    {
      num: 3,
      text: 'Aguarde o sorteio presencialmente no stand da Ticto',
    },
  ];

  return (
    <section aria-labelledby="rules-heading" className="flex flex-col gap-[8px] relative z-10">
      <h2 id="rules-heading" className="text-[14px] font-normal text-white/50 font-space leading-[1.6]">
        Confira as regras para participar
      </h2>

      <ol className="flex flex-col gap-[14px]">
        {steps.map((step) => (
          <li key={step.num} className="flex items-center gap-[14px] w-full text-[16px]">
            <span className="text-brand-cyan font-bold font-space leading-[1.6] flex-shrink-0">
              {step.num}
            </span>
            <span className="w-[4px] h-[4px] bg-brand-cyan flex-shrink-0" aria-hidden="true" />
            <p className="flex-1 text-white font-space font-normal leading-[1.2] whitespace-pre-wrap">
              {step.text}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
