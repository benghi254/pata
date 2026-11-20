// Ask before deleting a listing.
document.querySelectorAll('form.confirm-delete').forEach(function (form) {
  form.addEventListener('submit', function (e) {
    if (!window.confirm('Delete "' + form.dataset.name + '"? This cannot be undone.')) e.preventDefault();
  });
});
