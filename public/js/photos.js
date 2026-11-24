// Photo fields: shows previews, and shrinks big phone photos before they are uploaded
// (longest side 1600 px, JPEG), so uploads are quick on mobile data and stay under the size limit.
(function () {
  var MAX_SIDE = 1600;
  var canSwap = typeof DataTransfer === 'function' && typeof HTMLCanvasElement.prototype.toBlob === 'function';

  function shrink(file) {
    return new Promise(function (resolve) {
      if (!canSwap || !/^image\/(jpeg|png|webp)$/.test(file.type)) return resolve(file);
      var img = new Image();
      var src = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(src);
        var scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
        if (scale === 1 && file.size < 900 * 1024) return resolve(file); // already small
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // transparent PNGs get a white background as JPEG
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          if (!blob || blob.size >= file.size) return resolve(file);
          resolve(new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }));
        }, 'image/jpeg', 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(src); resolve(file); };
      img.src = src;
    });
  }

  document.querySelectorAll('[data-photo-field]').forEach(function (field) {
    var input = field.querySelector('input[type=file]');
    var previews = field.querySelector('[data-previews]');
    var note = field.querySelector('[data-photo-note]');
    var max = Number(field.getAttribute('data-max')) || 4;
    var form = input.form;
    var busy = null;

    function left() {
      var kept = field.querySelectorAll('[data-saved-photo] input[type=checkbox]:not(:checked)').length;
      return max - kept;
    }

    function show(files) {
      previews.innerHTML = '';
      files.forEach(function (f) {
        var img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.alt = '';
        img.onload = function () { URL.revokeObjectURL(img.src); };
        previews.appendChild(img);
      });
    }

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files);
      note.textContent = '';
      if (files.length > left()) {
        note.textContent = 'You can add ' + Math.max(left(), 0) + ' more photo' + (left() === 1 ? '' : 's') + '. Only the first ' + Math.max(left(), 0) + ' will be kept.';
        files = files.slice(0, Math.max(left(), 0));
      }
      show(files);
      busy = Promise.all(files.map(shrink)).then(function (small) {
        if (canSwap) {
          var dt = new DataTransfer();
          small.forEach(function (f) { dt.items.add(f); });
          input.files = dt.files;
        }
        busy = null;
      });
    });

    // Wait for shrinking to finish before the form is sent.
    form.addEventListener('submit', function (e) {
      if (!busy) return;
      e.preventDefault();
      var submitter = e.submitter;
      busy.then(function () {
        if (submitter && submitter.name) {
          var extra = document.createElement('input');
          extra.type = 'hidden'; extra.name = submitter.name; extra.value = submitter.value;
          form.appendChild(extra);
        }
        form.submit();
      });
    });
  });
})();
