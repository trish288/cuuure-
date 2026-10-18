import { useState } from "react";
import axios from "axios";

const API_URL =
  import.meta.env.VITE_API_URL || "https://cuuure-production.up.railway.app";

export default function Contact() {
  const [form, setForm] = useState({ patient_name: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    const patient_name = form.patient_name.trim();
    const phone = form.phone.replace(/\D/g, "").replace(/^91/, "");

    if (!/^[a-zA-Z\s]+$/.test(patient_name)) {
      setMessage({ type: "error", text: "Name must contain only letters and spaces." });
      return;
    }

    if (!/^\d{10}$/.test(phone)) {
      setMessage({ type: "error", text: "Phone number must be 10 digits." });
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API_URL}/api/website-booking`, { patient_name, phone });

      setMessage({
        type: "success",
        text: "Thank you! Your appointment request is received. We will contact you shortly.",
      });
      setForm({ patient_name: "", phone: "" });
    } catch (err) {
      setMessage({
        type: "error",
        text:
          err.response?.data?.message ||
          "Could not submit your request. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const fieldStyle = {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  };

  const inputStyle = {
    padding: "8px",
    borderRadius: "6px",
    border: "1px solid #ccc",
  };

  return (
    <section id="contact">
      <h2>Book Appointment</h2>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "15px",
          maxWidth: "400px",
        }}
      >
        <div style={fieldStyle}>
          <label htmlFor="patient_name">Name</label>
          <input
            id="patient_name"
            style={inputStyle}
            name="patient_name"
            value={form.patient_name}
            onChange={handleChange}
            maxLength={60}
            required
          />
        </div>

        <div style={fieldStyle}>
          <label htmlFor="phone">Mobile Number</label>
          <input
            id="phone"
            style={inputStyle}
            type="tel"
            inputMode="numeric"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            maxLength={14}
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px",
            borderRadius: "6px",
            border: "none",
            background: "#007BFF",
            color: "white",
            cursor: "pointer",
          }}
        >
          {loading ? "Submitting..." : "Book Appointment"}
        </button>

        {message && (
          <p style={{ color: message.type === "success" ? "green" : "crimson", margin: 0 }}>
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}
