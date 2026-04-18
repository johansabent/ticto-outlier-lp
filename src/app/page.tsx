import Image from 'next/image';
import { ShieldCheck } from 'lucide-react';
import { UTMRehydrator } from '@/components/utm-rehydrator';
import Hero from '@/components/Hero';
import Rules from '@/components/Rules';
import Footer from '@/components/Footer';
import { TypeformEmbed } from '@/components/typeform-embed';
import { getClientEnv } from '@/lib/env.client';

export default function Page() {
  const { NEXT_PUBLIC_TYPEFORM_FORM_ID } = getClientEnv();

  return (
    <div className="min-h-screen flex flex-col relative">
      {/* Background glow layers — overflow-hidden here only, not on sticky ancestor */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <Image
          src="/images/bg.png"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
          priority
        />
        <Image
          src="/images/bg-blur-right.svg"
          alt=""
          width={800}
          height={800}
          className="absolute top-0 right-0 max-w-[60vw] lg:max-w-none opacity-40 mix-blend-screen"
          priority
        />
        <Image
          src="/images/bg-blur-left.svg"
          alt=""
          width={800}
          height={800}
          className="absolute bottom-1/4 lg:top-1/4 left-0 max-w-[70vw] lg:max-w-none opacity-30 mix-blend-screen"
          priority
        />
      </div>

      <UTMRehydrator />

      <main
        id="main-content"
        className="flex-1 w-full max-w-[1440px] mx-auto px-[24px] lg:px-[112px] pt-[40px] lg:pt-[55px] pb-[44px] lg:pb-[140px] relative z-10 flex flex-col lg:flex-row lg:gap-[103px] items-start"
      >
        {/* Left column — Hero + Rules */}
        <div className="w-full lg:w-[624px] flex flex-col order-1">
          <Hero />
          <Rules />
        </div>

        {/* Right column — Typeform embed card, sticky on desktop */}
        <div
          id="cadastro"
          className="w-full lg:w-[488px] flex flex-col order-2 lg:sticky lg:top-24 lg:h-fit relative z-20 mt-[51px] lg:mt-0"
        >
          <div className="rounded-2xl bg-bg-white p-8 shadow-xl">
            <h2 className="mb-6 font-tomato text-xs font-bold uppercase tracking-wider text-accent-teal">
              CADASTRO 100% GRATUITO
            </h2>
            <TypeformEmbed formId={NEXT_PUBLIC_TYPEFORM_FORM_ID} />
            <p className="mt-4 text-xs text-placeholder leading-relaxed">
              Ao enviar seus dados, você autoriza que a Ticto entre em contato e
              declara estar ciente das{' '}
              <a
                href="https://ticto.com.br"
                target="_blank"
                rel="noopener noreferrer"
                className="underline decoration-solid hover:text-brand-cyan transition-colors"
              >
                Políticas e Termos
              </a>
              .
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-placeholder">
              <ShieldCheck className="w-5 h-5 text-brand-cyan" strokeWidth={2} />
              Seus dados estão seguros
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
