// Deduce si el lugar que escribe el cliente está en el Estado de México, para no tener que preguntarlo.

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Los 125 municipios del Estado de México y nombres cortos con los que la gente los escribe. */
const EDOMEX = [
  "acambay", "acolman", "aculco", "almoloya de alquisiras", "almoloya de juarez", "almoloya del rio", "amanalco",
  "amatepec", "amecameca", "apaxco", "atenco", "atizapan", "atizapan de zaragoza", "atlacomulco", "atlautla", "axapusco",
  "ayapango", "calimaya", "capulhuac", "coacalco", "coacalco de berriozabal", "coatepec harinas", "cocotitlan",
  "coyotepec", "cuautitlan", "cuautitlan izcalli", "izcalli", "chalco", "chapa de mota", "chapultepec", "chiautla",
  "chicoloapan", "chiconcuac", "chimalhuacan", "donato guerra", "ecatepec", "ecatepec de morelos", "ecatzingo",
  "huehuetoca", "hueypoxtla", "huixquilucan", "isidro fabela", "ixtapaluca", "ixtapan de la sal", "ixtapan del oro",
  "ixtlahuaca", "xalatlaco", "jaltenco", "jilotepec", "jilotzingo", "jiquipilco", "jocotitlan", "joquicingo",
  "juchitepec", "lerma", "malinalco", "melchor ocampo", "metepec", "mexicaltzingo", "naucalpan", "naucalpan de juarez",
  "nezahualcoyotl", "neza", "nextlalpan", "nicolas romero", "nopaltepec", "ocoyoacac", "ocuilan", "el oro", "otumba",
  "otzoloapan", "otzolotepec", "ozumba", "papalotla", "la paz", "los reyes la paz", "polotitlan", "rayon",
  "san antonio la isla", "san felipe del progreso", "san martin de las piramides", "san mateo atenco",
  "san simon de guerrero", "santo tomas", "soyaniquilpan", "soyaniquilpan de juarez", "sultepec", "tecamac",
  "ojo de agua", "tejupilco", "temamatla", "temascalapa", "temascalcingo", "temascaltepec", "temoaya", "tenancingo",
  "tenango del aire", "tenango del valle", "teoloyucan", "teotihuacan", "tepetlaoxtoc", "tepetlixpa", "tepotzotlan",
  "tequixquiac", "texcaltitlan", "texcalyacac", "texcoco", "tezoyuca", "tianguistenco", "santiago tianguistenco",
  "timilpan", "tlalmanalco", "tlalnepantla", "tlalnepantla de baz", "tlatlaya", "toluca", "tonatico", "tultepec",
  "tultitlan", "valle de bravo", "villa de allende", "villa del carbon", "villa guerrero", "villa victoria",
  "xonacatlan", "zacazonapan", "zacualpan", "zinacantepec", "zumpahuacan", "zumpango", "valle de chalco",
  "valle de chalco solidaridad", "luvianos", "san jose del rincon", "tonanitla", "estado de mexico", "edomex",
  "edo mex", "edo de mexico",
];

/** Lugares claramente fuera: Ciudad de México y estados o ciudades vecinas. */
const FUERA = [
  "cdmx", "ciudad de mexico", "df", "distrito federal", "alvaro obregon", "azcapotzalco", "coyoacan", "cuajimalpa",
  "gustavo a madero", "gam", "iztacalco", "iztapalapa", "magdalena contreras", "miguel hidalgo", "milpa alta",
  "tlahuac", "tlalpan", "venustiano carranza", "xochimilco", "puebla", "hidalgo", "pachuca", "tulancingo", "tlaxcala",
  "queretaro", "guerrero", "michoacan", "cuernavaca", "guadalajara", "monterrey", "veracruz", "oaxaca",
];

const contiene = (texto: string, nombre: string) => ` ${texto} `.includes(` ${nombre} `);

/**
 * "edomex" si se reconoce un municipio del Estado de México, "fuera" si es Ciudad de México u otro estado,
 * "desconocida" si no se reconoce (el vendedor lo confirma).
 * El Estado de México gana si aparecen los dos (hay colonias con nombre de alcaldías, p. ej. "Benito Juárez, Neza").
 */
export function zonaDeMunicipio(texto: string): "edomex" | "fuera" | "desconocida" {
  const t = normal(texto);
  if (EDOMEX.some((m) => contiene(t, m))) return "edomex";
  if (FUERA.some((m) => contiene(t, m))) return "fuera";
  return "desconocida";
}
