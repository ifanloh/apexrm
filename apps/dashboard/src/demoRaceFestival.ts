import { demoCourse } from "./demoCourse";

export type DemoRaceRankingPreview = {
  rank: number;
  name: string;
  bib: string;
  gap: string;
  status: "Finisher" | "In race" | "No ranking";
  category?: "men" | "women";
  checkpointId?: string;
  checkpointCode?: string;
  checkpointName?: string;
  checkpointKmMarker?: number;
  checkpointOrder?: number;
};

export type DemoRaceCard = {
  slug: string;
  title: string;
  editionLabel: string;
  scheduleLabel: string;
  startAt: string;
  startTown: string;
  courseDescription: string;
  courseHighlights: string[];
  distanceKm: number;
  ascentM: number;
  finishers: number;
  dnf: number;
  accent: string;
  accentSoft: string;
  profileSeed: number;
  profilePoints?: Array<{
    km: number;
    ele: number;
  }>;
  rankingPreview: DemoRaceRankingPreview[];
};

export const demoRaceFestival = {
  brandStack: ["MANTRA", "116"],
  brandName: "MANTRA116",
  editionLabel: "Edition 2025",
  dateRibbon: "Arjuno-Welirang Mountain Complex",
  locationRibbon: "Kaliandra Resort · East Java",
  homeTitle: "Race Categories",
  homeSubtitle:
    "Satu edition MANTRA116 dapat menayangkan beberapa kategori race sekaligus. Setiap kartu di bawah membuka live page spectator untuk kategori tersebut.",
  bannerTagline: "Organizer edition hub",
  races: [
    {
      slug: demoCourse.slug,
      title: "Mantra 116 Ultra",
      editionLabel: "Live",
      scheduleLabel: "Fri 05 Jul 23:59",
      startAt: "2025-07-05T23:59:00+07:00",
      startTown: "Kaliandra",
      courseDescription:
        "Ultra utama MANTRA116 melintasi rangkaian Arjuno-Welirang dengan tanjakan panjang, ridge teknikal, dan segmen malam yang paling menuntut di antara seluruh kategori.",
      courseHighlights: ["Night start", "Arjuno-Welirang ridge", "Longest cut-off"],
      distanceKm: 116,
      ascentM: 7400,
      finishers: 138,
      dnf: 34,
      accent: "#d67d2f",
      accentSoft: "rgba(214, 125, 47, 0.18)",
      profileSeed: 1,
      rankingPreview: [
        {
          rank: 1,
          name: "Arif Nugroho",
          bib: "M116",
          gap: "20:58:14",
          status: "In race",
          category: "men",
          checkpointId: "cp-30",
          checkpointCode: "CP3",
          checkpointName: "Summit Arjuno",
          checkpointKmMarker: 86,
          checkpointOrder: 3
        },
        {
          rank: 2,
          name: "Bayu Pambudi",
          bib: "U241",
          gap: "+09:41",
          status: "In race",
          category: "men",
          checkpointId: "cp-30",
          checkpointCode: "CP3",
          checkpointName: "Summit Arjuno",
          checkpointKmMarker: 86,
          checkpointOrder: 3
        },
        {
          rank: 3,
          name: "Raka Wijaya",
          bib: "U017",
          gap: "+18:09",
          status: "In race",
          category: "men",
          checkpointId: "cp-21",
          checkpointCode: "CP2",
          checkpointName: "Cangar",
          checkpointKmMarker: 54,
          checkpointOrder: 2
        },
        {
          rank: 4,
          name: "Putri Maharani",
          bib: "W112",
          gap: "+42:27",
          status: "In race",
          category: "women",
          checkpointId: "cp-21",
          checkpointCode: "CP2",
          checkpointName: "Cangar",
          checkpointKmMarker: 54,
          checkpointOrder: 2
        },
        {
          rank: 5,
          name: "Dimas Saputra",
          bib: "U045",
          gap: "+54:12",
          status: "In race",
          category: "men",
          checkpointId: "cp-10",
          checkpointCode: "CP1",
          checkpointName: "Welirang Hut",
          checkpointKmMarker: 28,
          checkpointOrder: 1
        },
        {
          rank: 6,
          name: "Siti Kurniawati",
          bib: "W018",
          gap: "+01:11:09",
          status: "In race",
          category: "women",
          checkpointId: "cp-10",
          checkpointCode: "CP1",
          checkpointName: "Welirang Hut",
          checkpointKmMarker: 28,
          checkpointOrder: 1
        },
        {
          rank: 7,
          name: "Fajar Pratama",
          bib: "U073",
          gap: "+01:35:50",
          status: "In race",
          category: "men",
          checkpointId: "cp-10",
          checkpointCode: "CP1",
          checkpointName: "Welirang Hut",
          checkpointKmMarker: 28,
          checkpointOrder: 1
        },
        {
          rank: 8,
          name: "Ayu Lestari",
          bib: "W101",
          gap: "+01:48:22",
          status: "In race",
          category: "women",
          checkpointId: "cp-10",
          checkpointCode: "CP1",
          checkpointName: "Welirang Hut",
          checkpointKmMarker: 28,
          checkpointOrder: 1
        }
      ]
    },
    {
      slug: "mantra-ultra-68",
      title: "Mantra Ultra 68",
      editionLabel: "Finished",
      scheduleLabel: "Fri 05 Jul 23:59",
      startAt: "2025-07-05T23:59:00+07:00",
      startTown: "Kaliandra",
      courseDescription:
        "Kategori 68K mengambil inti pegunungan utama dengan profil ultra yang tetap menantang, namun lebih cepat dan lebih padat dibanding rute 116K.",
      courseHighlights: ["Fast ultra", "Core mountain route", "Technical descent"],
      distanceKm: 68,
      ascentM: 4300,
      finishers: 214,
      dnf: 26,
      accent: "#df8a3a",
      accentSoft: "rgba(223, 138, 58, 0.18)",
      profileSeed: 2,
      rankingPreview: [
        { rank: 1, name: "Rizky Aditya", bib: "U681", gap: "12:44:10", status: "Finisher", category: "men" },
        { rank: 2, name: "M. Hafidz", bib: "U624", gap: "+06:24", status: "Finisher", category: "men" },
        { rank: 3, name: "Nabila Savitri", bib: "W684", gap: "+19:51", status: "Finisher", category: "women" },
        { rank: 4, name: "Yoga Pramana", bib: "U612", gap: "+28:08", status: "Finisher", category: "men" },
        { rank: 5, name: "Rina Puspita", bib: "W631", gap: "+35:42", status: "Finisher", category: "women" },
        { rank: 6, name: "Alvin Mahardika", bib: "U699", gap: "+47:03", status: "Finisher", category: "men" }
      ]
    },
    {
      slug: "mantra-trail-38",
      title: "Mantra Trail 38 Welirang",
      editionLabel: "Finished",
      scheduleLabel: "Sat 06 Jul 00:00",
      startAt: "2025-07-06T00:00:00+07:00",
      startTown: "Kaliandra",
      courseDescription:
        "Trail 38 Welirang menekankan ritme cepat dengan kombinasi single track hutan, punggungan terbuka, dan pemandangan khas sisi Welirang.",
      courseHighlights: ["Welirang flank", "Forest single track", "Fast mid-distance"],
      distanceKm: 38,
      ascentM: 2750,
      finishers: 308,
      dnf: 19,
      accent: "#4aa46d",
      accentSoft: "rgba(74, 164, 109, 0.18)",
      profileSeed: 3,
      rankingPreview: [
        { rank: 1, name: "Galih Ramadhan", bib: "W381", gap: "06:18:42", status: "Finisher", category: "men" },
        { rank: 2, name: "Dewi Paramita", bib: "W314", gap: "+05:17", status: "Finisher", category: "women" },
        { rank: 3, name: "Lucky Firmansyah", bib: "W329", gap: "+08:59", status: "Finisher", category: "men" },
        { rank: 4, name: "Nadya Laras", bib: "W376", gap: "+15:11", status: "Finisher", category: "women" },
        { rank: 5, name: "Teguh Baskoro", bib: "W305", gap: "+18:03", status: "Finisher", category: "men" },
        { rank: 6, name: "Intan Maharani", bib: "W341", gap: "+22:48", status: "Finisher", category: "women" }
      ]
    },
    {
      slug: "mantra-trail-34",
      title: "Mantra Trail 34 Arjuno",
      editionLabel: "Finished",
      scheduleLabel: "Sat 06 Jul 00:00",
      startAt: "2025-07-06T00:00:00+07:00",
      startTown: "Kaliandra",
      courseDescription:
        "Trail 34 Arjuno berfokus pada pendakian cepat ke area Arjuno sebelum turun tajam kembali ke basecamp, cocok untuk pelari gunung yang agresif.",
      courseHighlights: ["Arjuno climb", "Sharp descent", "Compact mountain race"],
      distanceKm: 34,
      ascentM: 3050,
      finishers: 291,
      dnf: 32,
      accent: "#7e6ae8",
      accentSoft: "rgba(126, 106, 232, 0.18)",
      profileSeed: 4,
      rankingPreview: [
        { rank: 1, name: "Aldino Prakoso", bib: "A341", gap: "07:05:18", status: "Finisher", category: "men" },
        { rank: 2, name: "Meylani Putri", bib: "A319", gap: "+07:02", status: "Finisher", category: "women" },
        { rank: 3, name: "Reno Putra", bib: "A366", gap: "+11:14", status: "Finisher", category: "men" },
        { rank: 4, name: "Cindy Aurelia", bib: "A327", gap: "+19:47", status: "Finisher", category: "women" },
        { rank: 5, name: "Gilang Permana", bib: "A354", gap: "+24:21", status: "Finisher", category: "men" },
        { rank: 6, name: "Silvia Kania", bib: "A308", gap: "+31:08", status: "Finisher", category: "women" }
      ]
    },
    {
      slug: "mantra-fun-17",
      title: "Mantra Fun 17",
      editionLabel: "Finished",
      scheduleLabel: "Sun 07 Jul 07:00",
      startAt: "2025-07-07T07:00:00+07:00",
      startTown: "Kaliandra",
      courseDescription:
        "Fun 17 adalah kategori cepat dengan satu putaran punggungan pendek, ideal untuk pelari yang ingin sensasi trail gunung tanpa durasi ultra.",
      courseHighlights: ["Short ridge loop", "Beginner friendly", "Scenic pace"],
      distanceKm: 17,
      ascentM: 1250,
      finishers: 426,
      dnf: 8,
      accent: "#d55a84",
      accentSoft: "rgba(213, 90, 132, 0.18)",
      profileSeed: 5,
      rankingPreview: [
        { rank: 1, name: "Rafi Muttaqin", bib: "F171", gap: "02:13:08", status: "Finisher", category: "men" },
        { rank: 2, name: "Aurellia Ningsih", bib: "F116", gap: "+03:12", status: "Finisher", category: "women" },
        { rank: 3, name: "Faqih Ramdan", bib: "F149", gap: "+05:05", status: "Finisher", category: "men" },
        { rank: 4, name: "Mutia Rahma", bib: "F173", gap: "+08:51", status: "Finisher", category: "women" },
        { rank: 5, name: "Kevin Sapto", bib: "F132", gap: "+10:14", status: "Finisher", category: "men" },
        { rank: 6, name: "Salsa Ayuningtyas", bib: "F104", gap: "+14:32", status: "Finisher", category: "women" }
      ]
    },
    {
      slug: "mantra-fun-10",
      title: "Mantra Fun 10",
      editionLabel: "Finished",
      scheduleLabel: "Sun 07 Jul 07:00",
      startAt: "2025-07-07T07:00:00+07:00",
      startTown: "Kaliandra",
      courseDescription:
        "Fun 10 merupakan loop trail singkat di sekitar Kaliandra dengan climb pendek, jalur hutan, dan finis cepat yang ramah untuk first-timer.",
      courseHighlights: ["Shortest course", "Forest loop", "First-timer friendly"],
      distanceKm: 10,
      ascentM: 700,
      finishers: 508,
      dnf: 4,
      accent: "#ec5567",
      accentSoft: "rgba(236, 85, 103, 0.18)",
      profileSeed: 6,
      rankingPreview: [
        { rank: 1, name: "Bagas Wardhana", bib: "F101", gap: "01:09:52", status: "Finisher", category: "men" },
        { rank: 2, name: "Nina Safira", bib: "F087", gap: "+02:08", status: "Finisher", category: "women" },
        { rank: 3, name: "Dio Alfarizi", bib: "F055", gap: "+04:16", status: "Finisher", category: "men" },
        { rank: 4, name: "Laras Wicaksono", bib: "F123", gap: "+06:42", status: "Finisher", category: "women" },
        { rank: 5, name: "Rendy Prakoso", bib: "F091", gap: "+08:30", status: "Finisher", category: "men" },
        { rank: 6, name: "Mira Shafitri", bib: "F066", gap: "+10:27", status: "Finisher", category: "women" }
      ]
    }
  ] satisfies DemoRaceCard[]
};


