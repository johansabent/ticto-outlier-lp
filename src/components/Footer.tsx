import Image from "next/image";
import Link from "next/link";

const TIC_TO_URL = "https://ticto.com.br";

const socialLinks = [
    { href: TIC_TO_URL, label: "Instagram", src: "/images/social-ig.svg", w: 17, h: 17 },
    { href: TIC_TO_URL, label: "YouTube", src: "/images/social-yt.svg", w: 22, h: 22 },
    { href: TIC_TO_URL, label: "Spotify", src: "/images/social-sp.svg", w: 22, h: 22 },
    { href: TIC_TO_URL, label: "LinkedIn", src: "/images/social-in.svg", w: 22, h: 22 },
    { href: TIC_TO_URL, label: "Facebook", src: "/images/social-fb.svg", w: 22, h: 22 },
    { href: TIC_TO_URL, label: "TikTok", src: "/images/social-tk.svg", w: 15, h: 17 },
];

function SocialIcons({ className }: { className: string }) {
    return (
        <div className={`flex-nowrap items-center justify-center lg:justify-start gap-[16px] lg:w-[384px] ${className}`}>
            {socialLinks.map(({ href, label, src, w, h }) => (
                <Link
                    key={label}
                    href={href}
                    aria-label={label}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 lg:flex-none w-[44px] h-[44px] shrink-0 rounded-[8px] border border-white/20 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                    <Image src={src} alt={label} width={w} height={h} loading="lazy" />
                </Link>
            ))}
        </div>
    );
}

export default function Footer() {
    return (
        <footer className="w-full bg-bg-black border-t border-white/5 relative z-10">
            {/* Main grid */}
            <div className="max-w-[1440px] mx-auto px-6 lg:px-[112px] pt-[24px] pb-[94px] lg:py-[80px] flex flex-col lg:flex-row lg:justify-between gap-[32px] border-b border-white/10">
                {/* Col 1: Logo + tagline + socials (socials desktop-only here) */}
                <div className="flex flex-col gap-[32px] lg:flex-1">
                    <div className="flex items-center gap-[6px] mx-auto lg:mx-0 w-fit">
                        <Image
                            src="/images/footer-ticto-2.svg"
                            alt=""
                            width={56}
                            height={56}
                            className="w-[56px] h-[56px]"
                        />
                        <Image
                            src="/images/footer-ticto-1.svg"
                            alt="Ticto"
                            width={116}
                            height={26}
                            className="w-[114px] h-[36px] object-contain"
                        />
                    </div>
                    <p className="text-[16px] font-normal text-[#d9d9d9] font-tomato leading-[1.5] tracking-[-0.176px] text-center lg:text-left">
                    A Ticto é a única plataforma focada em vendas e conversão de produtos físicos e digitais 💡
                    </p>
                    {/* Socials — desktop only in this position */}
                    <SocialIcons className="hidden lg:flex" />
                </div>

                {/* Col 2: Páginas nav */}
                <div className="flex flex-col gap-[32px] lg:items-start lg:flex-1">
                    <h2 className="hidden lg:block text-[16px] font-bold text-white tracking-[-0.176px] font-tomato leading-[1.5]">
                        Páginas
                    </h2>
                    <nav className="flex flex-col text-[16px] text-white font-tomato w-full">
                        <Link
                            href="#signup-form"
                            className="py-[16px] border-b border-white/10 hover:text-brand-cyan transition-colors tracking-[-0.176px] text-center lg:text-left"
                        >
                            Entrar
                        </Link>
                        <Link
                            href={TIC_TO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-[16px] border-b border-white/10 flex items-center justify-center lg:justify-start gap-[8px] hover:text-brand-cyan transition-colors tracking-[-0.176px]"
                        >
                            Suporte{" "}
                            <Image
                                src="/images/icon-arrow.svg"
                                alt="Arrow"
                                width={14}
                                height={14}
                                aria-hidden="true"
                                className="opacity-50"
                            />
                        </Link>
                        <Link
                            href={TIC_TO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-[16px] border-b border-white/10 hover:text-brand-cyan transition-colors tracking-[-0.176px] text-center lg:text-left"
                        >
                            Blog
                        </Link>
                    </nav>
                </div>

                {/* Col 3: CTA + App download + socials (mobile-only after stores) */}
                <div className="flex flex-col gap-[32px] lg:items-start lg:flex-1">
                    <h2 className="hidden lg:block text-[16px] font-bold text-white tracking-[-0.176px] font-tomato leading-[1.5]">
                        Baixe o nosso aplicativo
                    </h2>
                    <div className="flex gap-[16px] w-full">
                        <Link
                            href={TIC_TO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 h-[56px] border border-white/20 rounded-[100px] flex items-center justify-center px-[22px] hover:bg-white/5 transition-colors"
                        >
                            <Image
                                src="/images/store-play.svg"
                                alt="Google Play"
                                width={121}
                                height={29}
                                className="w-[120.891px] h-[29.47px]"
                                loading="lazy"
                            />
                        </Link>
                        <Link
                            href={TIC_TO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 h-[56px] border border-white/20 rounded-[100px] flex items-center justify-center px-[30px] hover:bg-white/5 transition-colors"
                        >
                            <Image
                                src="/images/store-apple.svg"
                                alt="App Store"
                                width={105}
                                height={28}
                                className="w-[104.513px] h-[28.386px]"
                                loading="lazy"
                            />
                        </Link>
                    </div>
                    <div
                        className="relative w-full rounded-[32px] p-[2px]"
                        style={{ background: 'linear-gradient(90deg, #FF9C2B, #FF2689, #9747FF)' }}
                    >
                        <Link
                            href="#signup-form"
                            className="flex w-full items-center justify-between px-[24px] py-[16px] rounded-[30px] bg-bg-black font-bold text-[16px] font-tomato tracking-[-0.176px] text-white hover:bg-white/5 transition-colors"
                        >
                            Crie sua conta
                            <Image
                                src="/images/icon-arrow-sm.svg"
                                alt="Arrow"
                                width={24}
                                height={24}
                                loading="lazy"
                            />
                        </Link>
                    </div>
                    {/* Socials — mobile only, after app stores */}
                    <SocialIcons className="flex lg:hidden" />
                </div>
            </div>

            {/* Bottom bar */}
            <div className="max-w-[1440px] mx-auto px-6 lg:px-[112px] pt-[32px] pb-[32px] flex flex-col lg:flex-row lg:justify-between items-center gap-4">
                <p className="order-2 lg:order-none text-[14px] text-[#D9D9D9] font-normal leading-[150%] tracking-[-0.154px] font-space text-center lg:text-left">
                    © 2025 - Ticto Tecnologia - Todos os direitos reservados.
                    CNPJ sob nº 28.618.386/0001-19
                </p>
                {/* Badges */}
                <div className="order-1 lg:order-none flex items-center gap-[24px]">
                    <Image
                        src="/images/badge-r2024.png"
                        alt="Reclame Aqui 2024"
                        width={94}
                        height={44}
                        className="w-[93.966px] h-[44px]"
                        loading="lazy"
                    />
                    <Image
                        src="/images/badge-pci.png"
                        alt="PCI DSS"
                        width={145}
                        height={44}
                        className="w-[145.302px] h-[44px]"
                        loading="lazy"
                    />
                </div>
                <Link
                    id="politicas-termos"
                    href={TIC_TO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="order-3 lg:order-none text-[14px] text-[#d9d9d9] tracking-[-0.154px] font-space underline decoration-solid hover:text-white transition-colors lg:ml-4"
                >
                    Políticas e Termos
                </Link>
            </div>
        </footer>
    );
}
