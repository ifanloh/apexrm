import { demoCourse } from "./demoCourse";

export type DemoRaceRankingPreview = {
  rank: number;
  name: string;
  bib: string;
  gap: string;
  status: "Finisher" | "In race" | "No ranking";
};

export type DemoRaceCard = {
  slug: string;
  title: string;
  editionLabel: string;
  scheduleLabel: string;
  startTown: string;
  distanceKm: number;
  ascentM: number;
  finishers: number;
  dnf: number;
  accent: string;
  accentSoft: string;
  profileSeed: number;
  rankingPreview: DemoRaceRankingPreview[];
};

export const demoRaceFestival = {
  brandStack: ["HOKA LES", "TEMPLIERS"],
  brandName: "HOKA LES TEMPLIERS",
  editionLabel: "Edition 2025",
  dateRibbon: "Du 16 au 19 octobre 2025",
  locationRibbon: "Millau Aveyron Occitanie",
  homeTitle: "Registered race categories",
  homeSubtitle:
    "Satu event bisa memiliki banyak kategori race. Setiap kartu di bawah mewakili kategori yang didaftarkan organizer ke platform dan punya live page sendiri.",
  bannerTagline: "Organizer edition hub",
  races: [
    {
      slug: demoCourse.slug,
      title: "Grand Trail des Templiers",
      editionLabel: "Finished",
      scheduleLabel: "Sun 19 Oct 05:12",
      startTown: "Millau",
      distanceKm: 80.7,
      ascentM: 3443,
      finishers: 2416,
      dnf: 229,
      accent: "#cf8b34",
      accentSoft: "rgba(207, 139, 52, 0.18)",
      profileSeed: 1,
      rankingPreview: []
    },
    {
      slug: "boffi-fifty",
      title: "Boffi Fifty",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 05:40",
      startTown: "Millau",
      distanceKm: 47.3,
      ascentM: 2208,
      finishers: 888,
      dnf: 21,
      accent: "#ec8a46",
      accentSoft: "rgba(236, 138, 70, 0.18)",
      profileSeed: 2,
      rankingPreview: [
        { rank: 1, name: "Clement Lalau", bib: "BL", gap: "4:35:56", status: "Finisher" },
        { rank: 2, name: "Mathieu Lorblanchet", bib: "ML", gap: "+11:24", status: "Finisher" },
        { rank: 3, name: "Pascal Domenech Pau", bib: "PD", gap: "+12:03", status: "Finisher" }
      ]
    },
    {
      slug: "dourbie-formi",
      title: "Dourbie Formi",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 07:10",
      startTown: "La Grauf.",
      distanceKm: 23.1,
      ascentM: 1229,
      finishers: 494,
      dnf: 7,
      accent: "#5dbf69",
      accentSoft: "rgba(93, 191, 105, 0.18)",
      profileSeed: 3,
      rankingPreview: [
        { rank: 1, name: "Hugo Lorentz", bib: "HL", gap: "2:38:42", status: "Finisher" },
        { rank: 2, name: "Mathis Montmasson", bib: "MM", gap: "+00:38", status: "Finisher" },
        { rank: 3, name: "Louison Bertin", bib: "LB", gap: "+03:53", status: "Finisher" }
      ]
    },
    {
      slug: "monna-lisa",
      title: "Monna Lisa",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 12:00",
      startTown: "Millau",
      distanceKm: 30.1,
      ascentM: 1115,
      finishers: 950,
      dnf: 19,
      accent: "#b770dd",
      accentSoft: "rgba(183, 112, 221, 0.18)",
      profileSeed: 4,
      rankingPreview: [
        { rank: 1, name: "Anthony Mendes", bib: "AM", gap: "2:50:16", status: "Finisher" },
        { rank: 2, name: "Florian Clubert", bib: "FC", gap: "+04:27", status: "Finisher" },
        { rank: 3, name: "Paul Morel-Bloch", bib: "PM", gap: "+10:58", status: "Finisher" }
      ]
    },
    {
      slug: "marathon-des-causses",
      title: "Marathon des Causses",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 12:00",
      startTown: "Millau",
      distanceKm: 34.1,
      ascentM: 1580,
      finishers: 1221,
      dnf: 46,
      accent: "#5867e8",
      accentSoft: "rgba(88, 103, 232, 0.18)",
      profileSeed: 5,
      rankingPreview: [
        { rank: 1, name: "Sylvain Gachardo", bib: "SG", gap: "3:31:47", status: "Finisher" },
        { rank: 2, name: "Tifere Debezet", bib: "TD", gap: "+04:03", status: "Finisher" },
        { rank: 3, name: "Nils Nelson", bib: "NN", gap: "+04:32", status: "Finisher" }
      ]
    },
    {
      slug: "kd-trail",
      title: "KD Trail",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 14:30",
      startTown: "Millau",
      distanceKm: 7.2,
      ascentM: 285,
      finishers: 47,
      dnf: 1,
      accent: "#f55667",
      accentSoft: "rgba(245, 86, 103, 0.18)",
      profileSeed: 6,
      rankingPreview: [
        { rank: 1, name: "Kilian Francois", bib: "KF", gap: "34:11", status: "Finisher" },
        { rank: 2, name: "Lazo Brass", bib: "LB", gap: "+00:28", status: "Finisher" },
        { rank: 3, name: "Clement Samium", bib: "CS", gap: "+01:24", status: "Finisher" }
      ]
    },
    {
      slug: "la-templiere",
      title: "La Templiere",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 13:46",
      startTown: "Millau",
      distanceKm: 7.2,
      ascentM: 285,
      finishers: 352,
      dnf: 0,
      accent: "#dc6ca5",
      accentSoft: "rgba(220, 108, 165, 0.18)",
      profileSeed: 7,
      rankingPreview: [
        { rank: 1, name: "Juliette Gilibert", bib: "JG", gap: "54:41", status: "Finisher" },
        { rank: 2, name: "Marie Nelson", bib: "MN", gap: "+01:10", status: "Finisher" },
        { rank: 3, name: "Julie Bares-Albaret", bib: "JA", gap: "+01:54", status: "Finisher" }
      ]
    },
    {
      slug: "la-templiere-rando",
      title: "La Templiere Rando",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 13:47",
      startTown: "Millau",
      distanceKm: 7.7,
      ascentM: 285,
      finishers: 44,
      dnf: 0,
      accent: "#d06f9e",
      accentSoft: "rgba(208, 111, 158, 0.18)",
      profileSeed: 8,
      rankingPreview: []
    },
    {
      slug: "les-troubadours",
      title: "Les Troubadours",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 14:30",
      startTown: "Millau",
      distanceKm: 11.8,
      ascentM: 530,
      finishers: 498,
      dnf: 1,
      accent: "#6ab1a0",
      accentSoft: "rgba(106, 177, 160, 0.18)",
      profileSeed: 9,
      rankingPreview: [
        { rank: 1, name: "George Bennett", bib: "GB", gap: "53:17", status: "Finisher" },
        { rank: 2, name: "Lio Morgan", bib: "LM", gap: "+03:17", status: "Finisher" },
        { rank: 3, name: "Benoit Meintel", bib: "BM", gap: "+05:42", status: "Finisher" }
      ]
    },
    {
      slug: "troubadours-randonnee",
      title: "Troubadours Randonnee",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 14:31",
      startTown: "Millau",
      distanceKm: 11.8,
      ascentM: 530,
      finishers: 84,
      dnf: 2,
      accent: "#75bea9",
      accentSoft: "rgba(117, 190, 169, 0.18)",
      profileSeed: 10,
      rankingPreview: []
    },
    {
      slug: "vo2-trail",
      title: "VO2 Trail",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 15:01",
      startTown: "Millau",
      distanceKm: 17.1,
      ascentM: 708,
      finishers: 567,
      dnf: 15,
      accent: "#72bff1",
      accentSoft: "rgba(114, 191, 241, 0.18)",
      profileSeed: 11,
      rankingPreview: [
        { rank: 1, name: "Corentin Capelier", bib: "CC", gap: "1:13:29", status: "Finisher" },
        { rank: 2, name: "Justyn Pettiferre", bib: "JP", gap: "+01:25", status: "Finisher" },
        { rank: 3, name: "Lucas Menillon", bib: "LM", gap: "+02:12", status: "Finisher" }
      ]
    },
    {
      slug: "junior-trail",
      title: "Junior Trail",
      editionLabel: "Finished",
      scheduleLabel: "Sat 18 Oct 15:50",
      startTown: "Millau",
      distanceKm: 17.1,
      ascentM: 708,
      finishers: 86,
      dnf: 0,
      accent: "#d1a26f",
      accentSoft: "rgba(209, 162, 111, 0.18)",
      profileSeed: 12,
      rankingPreview: [
        { rank: 1, name: "Julian Brulin", bib: "JB", gap: "1:16:38", status: "Finisher" },
        { rank: 2, name: "Clement Coudert", bib: "CC", gap: "+01:14", status: "Finisher" },
        { rank: 3, name: "Baptiste Roucaud", bib: "BR", gap: "+01:51", status: "Finisher" }
      ]
    }
  ] satisfies DemoRaceCard[]
};
