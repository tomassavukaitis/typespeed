class TypingEngine {
  constructor(passage, displayElement) {
    this.passage = passage;
    this.displayElement = displayElement;
    this.spans = [];
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.currentIndex = 0;
    this.finished = false;

    this._renderPassage();
  }

  _renderPassage() {
    this.displayElement.innerHTML = '';
    this.spans = [];

    for (let i = 0; i < this.passage.length; i++) {
      const span = document.createElement('span');
      span.classList.add('char');
      span.textContent = this.passage[i];
      this.displayElement.appendChild(span);
      this.spans.push(span);
    }

    if (this.spans.length > 0) {
      this.spans[0].classList.add('current');
    }
  }

  update(typedText) {
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.currentIndex = typedText.length;

    for (let i = 0; i < this.spans.length; i++) {
      const span = this.spans[i];
      span.className = 'char';

      if (i < typedText.length) {
        if (typedText[i] === this.passage[i]) {
          span.classList.add('correct');
          this.correctCount++;
        } else {
          span.classList.add('incorrect');
          this.incorrectCount++;
        }
      } else if (i === typedText.length) {
        span.classList.add('current');
      }
    }

    this.finished = typedText.length >= this.passage.length;
    return this.finished;
  }

  getStats() {
    return {
      correctCount: this.correctCount,
      incorrectCount: this.incorrectCount,
      totalTyped: this.correctCount + this.incorrectCount,
      totalChars: this.passage.length,
    };
  }

  getReviewHTML() {
    let html = '';
    for (let i = 0; i < this.spans.length; i++) {
      const char = this.passage[i] === ' ' ? ' ' : this.escapeHTML(this.passage[i]);
      if (i < this.currentIndex) {
        if (this.spans[i].classList.contains('correct')) {
          html += `<span class="char-correct">${char}</span>`;
        } else {
          html += `<span class="char-incorrect">${char}</span>`;
        }
      } else {
        html += `<span class="char-untyped">${char}</span>`;
      }
    }
    return html;
  }

  escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
