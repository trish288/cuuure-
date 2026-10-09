const {
  DAYS_TO_SHOW,
  START_HOUR,
  END_HOUR,
} = require("../data/constants");

const { appointmentsCache } = require("../db/initDB");

/* ===============================
   MAIN MENU
================================ */
function getMainMenuRows() {
  return [
    {
      id: "menu_book",
      title: "Book Appointment",
      description: "Schedule a doctor visit",
    },
    {
      id: "menu_view",
      title: "View Appointments",
      description: "Check your existing bookings",
    },
    {
      id: "menu_support",
      title: "Contact Support",
      description: "Get help from Cuure.health",
    },
  ];
}

/* ===============================
   DATE ROWS
================================ */
function getUpcomingDayRows() {
  const rows = [];
  const today = new Date();

  for (let i = 0; i < DAYS_TO_SHOW; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");

    const dateStr = `${yyyy}-${mm}-${dd}`;
    const dayName = d.toLocaleDateString("en-IN", {
      weekday: "short",
    });

    rows.push({
      id: `date_${dateStr}`,
      title: `${dayName}, ${dd}-${mm}`,
      description: "",
    });
  }

  return rows;
}

/* ===============================
   GENERATE TIME SLOTS DYNAMICALLY
================================ */
function generateTimeSlots(date) {
  const slots = [];

  const now = new Date();

  // Get today's date in YYYY-MM-DD
  const todayStr =
    `${now.getFullYear()}-` +
    `${String(now.getMonth() + 1).padStart(2, "0")}-` +
    `${String(now.getDate()).padStart(2, "0")}`;

  const isToday = date === todayStr;

  let firstHour = START_HOUR;

  /*
   * If the selected date is today,
   * only show slots that are still upcoming.
   */
  if (isToday) {
    const currentHour = now.getHours();

    // Move to the next full-hour slot
    firstHour = Math.max(
      START_HOUR,
      currentHour + 1
    );
  }

  for (let hour = firstHour; hour < END_HOUR; hour++) {
    const nextHour = hour + 1;

    const startLabel = formatHour(hour);
    const endLabel = formatHour(nextHour);

    slots.push({
      label: `${startLabel} – ${endLabel}`,
      value: `${String(hour).padStart(2, "0")}:00`,
    });
  }

  return slots;
}

/* ===============================
   FORMAT HOUR
================================ */
function formatHour(hour) {
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:00 ${period}`;
}

/* ===============================
   AVAILABLE TIME SLOTS
================================ */
function getAvailableSlots(date) {
  const timeSlots = generateTimeSlots(date);

  return timeSlots.filter(
    slot =>
      !appointmentsCache.find(
        a =>
          a.date === date &&
          a.time_value === slot.value
      )
  );
}

/* ===============================
   TIME ROWS
================================ */
function getTimeRowsForDate(date) {
  return getAvailableSlots(date).map(slot => ({
    id: `time_${slot.value}`,
    title: slot.label,
    description: "",
  }));
}

module.exports = {
  mainMenu,
  getMainMenuRows,
  getUpcomingDayRows,
  getTimeRowsForDate,
  getAvailableSlots,
};