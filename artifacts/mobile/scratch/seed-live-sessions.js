import { initializeApp } from "firebase/app";
import { getFirestore, collection, addDoc, serverTimestamp } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAYQ5iMHHCyz0Kr2QtdumNw3W7clS19OFg",
  authDomain: "learnpath-9ce0d.firebaseapp.com",
  projectId: "learnpath-9ce0d",
  storageBucket: "learnpath-9ce0d.firebasestorage.app",
  messagingSenderId: "1033210283172",
  appId: "1:1033210283172:web:a8a72156d61632d36a1231"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seedLiveSessions() {
  const sessions = [
    {
      title: "Live: Belajar Kanji N4 (Interaktif)",
      teacher: "Sensei Yuki",
      avatar: "https://i.pravatar.cc/150?u=yuki",
      time: "Sedang Berlangsung",
      date: new Date().toISOString(),
      level: "N4",
      type: "in_app",
      status: "live",
      description: "Sesi tanya jawab langsung dan latihan Kanji N4.",
      link: "/live-room",
      streamUrl: "https://d23dyxeqlo5psv.cloudfront.net/big_buck_bunny.mp4"
    },
    {
      title: "Bedah Soal JLPT N3: Dokkai",
      teacher: "Sensei Yuki",
      avatar: "https://i.pravatar.cc/150?u=yuki",
      time: "19:00 - 20:30",
      date: new Date().toISOString(),
      level: "N3",
      type: "zoom",
      status: "live",
      description: "Sesi intensif membahas strategi menjawab soal bacaan N3.",
      link: "https://zoom.us/j/real_zoom_link_here"
    }
  ];

  for (const session of sessions) {
    await addDoc(collection(db, "live_sessions"), session);
    console.log(`Added session: ${session.title}`);
  }
}

seedLiveSessions().then(() => console.log("Seeding complete")).catch(console.error);
