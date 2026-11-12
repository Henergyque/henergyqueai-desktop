const form = document.getElementById("form");
const field = document.getElementById("prompt");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = field.value.trim();
  if (!text) return;
  window.quick.submit(text);
  field.value = "";
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") window.quick.hide();
});

window.quick.onOpen(() => {
  field.focus();
  field.select();
});
