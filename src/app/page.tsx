import { UTMRehydrator } from '@/components/utm-rehydrator';
import Hero from '@/components/Hero';
import Rules from '@/components/Rules';
import Footer from '@/components/Footer';
import { TypeformEmbed } from '@/components/typeform-embed';

export default function Page() {
  return (
    <>
      <UTMRehydrator />
      <main>
        <Hero />
        <Rules />
        <section id="cadastro" className="px-6 py-16">
          <div className="mx-auto max-w-lg">
            <div className="rounded-2xl border border-brand-cyan/20 bg-dark-700 p-8 shadow-xl">
              <h2 className="mb-2 font-tomato text-2xl font-bold text-bg-white">
                CADASTRO 100% GRATUITO
              </h2>
              <p className="mb-6 text-sm text-text-muted flex items-center gap-1">
                <span>🔒</span> Seus dados estão seguros
              </p>
              <TypeformEmbed formId={process.env.NEXT_PUBLIC_TYPEFORM_FORM_ID!} />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
