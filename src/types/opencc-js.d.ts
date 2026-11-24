declare module 'opencc-js' {
  interface ConverterOptions {
    from: 'cn' | 'tw' | 'hk' | 'jp'
    to: 'cn' | 'tw' | 'hk' | 'jp'
  }

  interface Converter {
    (text: string): string
  }

  export function Converter(options: ConverterOptions): Converter
  export default function OpenCC(options: ConverterOptions): Converter
}
declare module 'opencc-js/dict/*' {
  const dictionary: string
  export default dictionary
}
