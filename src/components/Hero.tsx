import Image from 'next/image';

/**
 * Renders the landing-page hero section containing partner logos, a headline and supporting copy, a promotional gradient frame with prize and phone imagery, and a final descriptive paragraph.
 *
 * @returns The hero section as a JSX element
 */
export default function Hero() {
  return (
    <section className="relative z-10 w-full lg:w-[624px] mx-auto">
      <header className="flex items-center justify-center lg:justify-start gap-4 lg:gap-[43px] mb-[37px] lg:mb-[95px]">
        <Image src="/images/logo-ticto.png" alt="Ticto" width={153} height={44} className="w-[115px] h-[33px] lg:w-[153px] lg:h-[44px]" />
        <div className="w-[1px] h-[24px] lg:h-[32px] bg-white/20"></div>
        <Image src="/images/logo-ebulicao.png" alt="Ebulição" width={197} height={52} className="w-[148px] h-[39px] lg:w-[197px] lg:h-[52px]" />
      </header>

      <div className="flex flex-col gap-[14px]">
        <div className="flex flex-col gap-[32px]">
          <div className="inline-flex w-fit self-center lg:self-start items-center gap-2 px-[20px] py-[8px] rounded-[250px] border border-[rgba(91,190,217,0.28)] bg-[rgba(91,190,217,0.08)] backdrop-blur-sm">
            <span className="text-brand-cyan text-[9px] lg:text-[14px] font-normal uppercase tracking-[0.45px] lg:tracking-[0.7px] font-inter whitespace-nowrap">
              TRANSFORME SEU NEGÓCIO EM UMA MÁQUINA DE VENDAS
            </span>
          </div>

          <h1 className="self-stretch text-[30px] lg:text-[32px] font-normal text-white leading-[1.2] font-inter tracking-normal">
            A ebulição instantânea para produtos digitais e físicos começa com a maior e mais poderosa plataforma do Brasil
          </h1>
        </div>

        <p className="text-[16px] text-white leading-[1.4] font-space max-w-[624px]">
          Milhares de empresários <strong className="font-bold">como você</strong> alavancaram seus negócios e alcançaram 6 e 7 dígitos no digital com as estratégias que compartilhamos.
        </p>
      </div>

      <div
        className="promo-frame-gradient w-[624px] max-w-full bg-transparent rounded-[8px] h-[117px] lg:h-[193px] mt-[32px] mb-[32px] overflow-hidden relative"
      >
        <div className="absolute left-[22px] top-[21px] lg:left-[53px] lg:top-[39px]">
          <p className="text-[16px] lg:text-[24px] text-white font-tomato font-normal leading-[1.2] w-[193px] lg:w-[350px]">
            Criando sua conta na plataforma, você pode concorrer a um{' '}
            <span className="text-brand-cyan block">iPhone 16 Pro</span>
          </p>
        </div>

        <div className="absolute left-[231px] top-[17px] w-[83px] h-[100px] lg:left-[399px] lg:top-[21px] lg:w-[158px] lg:h-[172px] overflow-hidden pointer-events-none">
          <Image
            src="/images/iphone-16-pro.png"
            alt="iPhone 16 Pro"
            width={113}
            height={170}
            className="lg:hidden absolute max-w-none left-[-10.707px] top-[-36.68px] w-[113px] h-[170px]"
          />
          <Image
            src="/images/iphone-16-pro.png"
            alt="iPhone 16 Pro"
            width={214}
            height={322}
            className="hidden lg:block absolute max-w-none left-[-19.576px] top-[-68.955px] w-[214px] h-[322px]"
          />
          <div className="absolute left-[43px] top-[69px] lg:left-[81.85px] lg:top-[117.69px] opacity-90">
            <Image src="/images/logo-ticto-phone.svg" alt="Ticto" width={44} height={13} className="w-[23px] h-[7px] lg:w-[44.292px] lg:h-[12.655px]" />
          </div>
        </div>
      </div>

      <p className="text-[16px] text-white font-space leading-[1.4] mb-[32px] max-w-[624px]">
        A Ticto tem o orgulho de ser uma das patrocinadoras do evento Ebulição por Rafa Prado e trouxe esta oportunidade especial para você.
      </p>
    </section>
  );
}
