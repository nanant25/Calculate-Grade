import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

/* ---------- Firebase ---------- */
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

/* ---------- ข้อมูลตั้งต้น ---------- */
const GRADE_OPTIONS = [
    { label: "A (4.0)", value: 4 },
    { label: "B+ (3.5)", value: 3.5 },
    { label: "B (3.0)", value: 3 },
    { label: "C+ (2.5)", value: 2.5 },
    { label: "C (2.0)", value: 2 },
    { label: "D+ (1.5)", value: 1.5 },
    { label: "D (1.0)", value: 1 },
    { label: "F (0)", value: 0 }
];

const INITIAL_SUBJECTS = [
    { name: "คณิตศาสตร์", credits: 2.0, grade: 3.5 },
    { name: "ภาษาอังกฤษ", credits: 1.0, grade: 4 },
    { name: "วิทยาศาสตร์", credits: 1.5, grade: 3 },
    { name: "ภาษาไทย", credits: 1.0, grade: 3 }
];

/* ข้อความ error ของการล็อกอิน (ภาษาไทย บอกวิธีแก้) */
const LOGIN_ERRORS = {
    "auth/configuration-not-found":
        "ยังไม่ได้เปิดใช้ Authentication ในโปรเจกต์ Firebase ให้กด Get started แล้วเปิด Google ที่แท็บ Sign-in method",
    "auth/operation-not-allowed":
        "ยังไม่ได้เปิดล็อกอิน Google ที่แท็บ Sign-in method ใน Firebase",
    "auth/unauthorized-domain":
        "โดเมนนี้ยังไม่ได้รับอนุญาต ให้เปิดเว็บผ่าน localhost หรือเพิ่มโดเมนที่ Authorized domains",
    "auth/popup-blocked":
        "เบราว์เซอร์บล็อกป๊อปอัป กรุณาอนุญาตป๊อปอัปแล้วลองใหม่",
    "auth/popup-closed-by-user":
        "ปิดหน้าต่างล็อกอินก่อนเสร็จ ลองกดใหม่อีกครั้ง",
    "auth/cancelled-popup-request":
        "มีหน้าต่างล็อกอินเปิดอยู่แล้ว ลองกดใหม่อีกครั้ง",
    "auth/network-request-failed":
        "เชื่อมต่อเครือข่ายไม่สำเร็จ ลองใหม่อีกครั้ง",
    "auth/invalid-api-key":
        "apiKey ในไฟล์ firebase-config.js ไม่ถูกต้อง"
};

const $ = (id) => document.getElementById(id);
const subjectList = $("subjectList");

let currentUser = null;
let guestMode = false;

/* ---------- ตัวช่วย ---------- */
function formatGPA(value) {
    return Number.isFinite(value) ? value.toFixed(2) : "–";
}

function round2(value) {
    return Math.round(value * 100) / 100;
}

function readNumber(id) {
    const value = parseFloat($(id).value);
    return Number.isFinite(value) && value >= 0 ? value : 0;
}

/* ---------- สร้างแถววิชา ---------- */
function createRow({ name = "", credits = "", grade = 4 } = {}) {
    const tr = document.createElement("tr");

    // ชื่อวิชา
    const nameTd = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "subject-name";
    nameInput.placeholder = "ชื่อวิชา";
    nameInput.value = name;
    nameInput.setAttribute("aria-label", "ชื่อวิชา");
    nameTd.appendChild(nameInput);

    // หน่วยกิต
    const creditsTd = document.createElement("td");
    const creditsInput = document.createElement("input");
    creditsInput.type = "number";
    creditsInput.className = "subject-credits";
    creditsInput.min = "0";
    creditsInput.step = "0.5";
    creditsInput.placeholder = "0";
    creditsInput.value = credits;
    creditsInput.setAttribute("aria-label", "หน่วยกิต");
    creditsTd.appendChild(creditsInput);

    // เกรด
    const gradeTd = document.createElement("td");
    const gradeSelect = document.createElement("select");
    gradeSelect.className = "subject-grade";
    gradeSelect.setAttribute("aria-label", "เกรด");
    GRADE_OPTIONS.forEach((option) => {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        gradeSelect.appendChild(el);
    });
    gradeSelect.value = grade;
    gradeTd.appendChild(gradeSelect);

    // ปุ่มลบ
    const removeTd = document.createElement("td");
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "removeBtn";
    removeBtn.textContent = "✕";
    removeBtn.setAttribute("aria-label", "ลบรายวิชานี้");
    removeTd.appendChild(removeBtn);

    tr.append(nameTd, creditsTd, gradeTd, removeTd);
    return tr;
}

/* ---------- คำนวณ ---------- */
function getTermTotals() {
    let credits = 0;
    let points = 0;

    subjectList.querySelectorAll("tr").forEach((tr) => {
        const c = parseFloat(tr.querySelector(".subject-credits").value);
        const g = parseFloat(tr.querySelector(".subject-grade").value);
        if (Number.isFinite(c) && c > 0 && Number.isFinite(g)) {
            credits += c;
            points += c * g;
        }
    });

    return { credits, points };
}

function getAllTotals() {
    const term = getTermTotals();
    const prevCredits = readNumber("prevCredits");
    const prevPoints = readNumber("prevGPAX") * prevCredits;

    return {
        term,
        credits: prevCredits + term.credits,
        points: prevPoints + term.points
    };
}

function updateDashboard() {
    const { term, credits, points } = getAllTotals();
    const termGPA = term.credits > 0 ? term.points / term.credits : NaN;
    const gpax = credits > 0 ? points / credits : NaN;

    $("totalCredits").textContent = round2(term.credits);
    $("termGPA").textContent = formatGPA(termGPA);
    $("currentGPA").textContent = formatGPA(termGPA);
    $("currentGPAX").textContent = formatGPA(gpax);
    $("targetGPAX").textContent = formatGPA(parseFloat($("goalInput").value));
}

function calculateGoal() {
    updateDashboard();
    saveData();

    const result = $("result");
    const target = parseFloat($("goalInput").value);
    const nextCredits = parseFloat($("nextCredits").value);

    if (!Number.isFinite(target) || target < 0 || target > 4) {
        result.textContent = "กรอก GPAX เป้าหมายให้อยู่ระหว่าง 0.00 ถึง 4.00";
        return;
    }
    if (!(nextCredits > 0)) {
        result.textContent = "กรอกหน่วยกิตที่จะลงเรียนในเทอมถัดไปก่อน";
        return;
    }

    const { credits, points } = getAllTotals();
    const needed = (target * (credits + nextCredits) - points) / nextCredits;
    const bestPossible = (points + 4 * nextCredits) / (credits + nextCredits);

    if (needed > 4) {
        result.innerHTML =
            "เทอมถัดไปต่อให้ได้ 4.00 ทุกวิชา GPAX จะขึ้นได้สูงสุดแค่ <strong>" +
            formatGPA(bestPossible) +
            "</strong> ลองเพิ่มหน่วยกิตที่ลง หรือปรับเป้าหมายลง";
    } else if (needed <= 0) {
        result.innerHTML =
            "คุณถึงเป้าหมายแล้ว แม้เทอมถัดไปจะได้ 0.00 GPAX ก็ยังไม่ต่ำกว่า <strong>" +
            formatGPA(target) +
            "</strong>";
    } else {
        result.innerHTML =
            "เทอมถัดไปต้องได้ GPA เฉลี่ยอย่างน้อย <strong>" +
            formatGPA(needed) +
            "</strong> จึงจะได้ GPAX " +
            formatGPA(target);
    }
}

/* ---------- เก็บ / ใส่ข้อมูลในหน้า ---------- */
function resetToDefaults() {
    subjectList.replaceChildren(...INITIAL_SUBJECTS.map((s) => createRow(s)));
    ["prevGPAX", "prevCredits", "nextCredits"].forEach((id) => {
        $(id).value = "";
    });
    $("goalInput").value = "3.75";
    $("result").textContent = "ผลการคำนวณจะแสดงที่นี่";
    updateDashboard();
}

function collectData() {
    const subjects = [...subjectList.querySelectorAll("tr")].map((tr) => ({
        name: tr.querySelector(".subject-name").value,
        credits: tr.querySelector(".subject-credits").value,
        grade: parseFloat(tr.querySelector(".subject-grade").value)
    }));

    return {
        subjects,
        prevGPAX: $("prevGPAX").value,
        prevCredits: $("prevCredits").value,
        nextCredits: $("nextCredits").value,
        goal: $("goalInput").value
    };
}

function applyData(data) {
    const subjects = Array.isArray(data.subjects) ? data.subjects : [];
    subjectList.replaceChildren(...subjects.map((s) => createRow(s)));
    $("prevGPAX").value = data.prevGPAX ?? "";
    $("prevCredits").value = data.prevCredits ?? "";
    $("nextCredits").value = data.nextCredits ?? "";
    $("goalInput").value = data.goal ?? "3.75";
    updateDashboard();
}

/* ---------- บันทึก / โหลด (Firestore) ---------- */
function setStatus(text) {
    $("userStatus").textContent = text;
}

async function saveData() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    try {
        await setDoc(doc(db, "users", uid), {
            ...collectData(),
            updatedAt: Date.now()
        });
        setStatus("บันทึกแล้ว");
    } catch (error) {
        console.error(error);
        setStatus("บันทึกไม่สำเร็จ (" + (error.code || "error") + ")");
    }
}

async function loadData() {
    if (!currentUser) return;
    const uid = currentUser.uid;
    try {
        const snap = await getDoc(doc(db, "users", uid));
        if (snap.exists()) {
            applyData(snap.data());
            setStatus("โหลดข้อมูลที่บันทึกไว้แล้ว");
        } else {
            // บัญชีใหม่: เก็บสิ่งที่อยู่บนหน้าตอนนี้ไว้เป็นข้อมูลแรก
            await saveData();
        }
    } catch (error) {
        console.error(error);
        setStatus("โหลดข้อมูลไม่สำเร็จ (" + (error.code || "error") + ")");
    }
}

/* ---------- ล็อกอิน / ออกจากระบบ ---------- */
async function signInWithGoogle() {
    $("loginError").textContent = "";
    try {
        await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
        console.error(error);
        const code = error.code || "unknown";
        const message =
            (LOGIN_ERRORS[code] || "เข้าสู่ระบบไม่สำเร็จ") + " (" + code + ")";
        $("loginError").textContent = message;
        if (guestMode) setStatus(message);
    }
}

async function logout() {
    await signOut(auth);
    guestMode = false;
    resetToDefaults();
}

function renderUserBar() {
    $("userBar").hidden = false;
    const avatar = $("userAvatar");

    if (currentUser) {
        $("userName").textContent =
            currentUser.displayName || currentUser.email || "ผู้ใช้";
        if (currentUser.photoURL) {
            avatar.src = currentUser.photoURL;
            avatar.hidden = false;
        } else {
            avatar.hidden = true;
        }
        $("authBtn").textContent = "ออกจากระบบ";
    } else {
        $("userName").textContent = "Guest";
        avatar.hidden = true;
        setStatus("ข้อมูลจะไม่ถูกบันทึก");
        $("authBtn").textContent = "เข้าสู่ระบบด้วย Google";
    }
}

onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    document.body.classList.remove("auth-pending");

    if (user) {
        guestMode = false;
        $("loginScreen").hidden = true;
        renderUserBar();
        setStatus("กำลังโหลดข้อมูล...");
        await loadData();
    } else if (guestMode) {
        renderUserBar();
    } else {
        $("userBar").hidden = true;
        $("loginScreen").hidden = false;
    }
});

/* ---------- เหตุการณ์ ---------- */
subjectList.addEventListener("click", (event) => {
    const btn = event.target.closest(".removeBtn");
    if (!btn) return;
    btn.closest("tr").remove();
});

$("addSubjectBtn").addEventListener("click", () => {
    const row = createRow();
    subjectList.appendChild(row);
    row.querySelector(".subject-name").focus();
});

$("calcSubjectsBtn").addEventListener("click", () => {
    updateDashboard();
    saveData();
});

$("calculateBtn").addEventListener("click", calculateGoal);

$("googleLoginBtn").addEventListener("click", signInWithGoogle);

$("guestBtn").addEventListener("click", () => {
    guestMode = true;
    $("loginScreen").hidden = true;
    renderUserBar();
});

$("authBtn").addEventListener("click", () => {
    if (currentUser) {
        logout();
    } else {
        signInWithGoogle();
    }
});

/* ---------- เริ่มต้น ---------- */
resetToDefaults();