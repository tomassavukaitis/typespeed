class TypingEngine {
  constructor(passage, displayElement) {
    this.passage = passage;
    this.displayElement = displayElement;
    this.spans = [];
    this.correctCount = 0;
    this.incorrectCount = 0;
    this.totalMistakes = 0;
    this.totalKeystrokes = 0;
    this.everIncorrect = new Set();
    this.previousLength = 0;
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

    // Only count new forward keystrokes, not backspaces
    if (typedText.length > this.previousLength) {
      const newChars = typedText.length - this.previousLength;
      for (let i = this.previousLength; i < typedText.length; i++) {
        this.totalKeystrokes++;
        if (i < this.passage.length && typedText[i] !== this.passage[i]) {
          if (!this.everIncorrect.has(i)) {
            this.everIncorrect.add(i);
            this.totalMistakes++;
          }
        }
      }
    }
    this.previousLength = typedText.length;

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

    // Auto-scroll to keep current position visible
    const target = this.spans[this.currentIndex] || this.spans[this.spans.length - 1];
    if (target) {
      const container = this.displayElement;
      const targetTop = target.offsetTop;
      const targetHeight = target.offsetHeight;
      const scrollTop = container.scrollTop;
      const containerHeight = container.clientHeight;

      if (targetTop < scrollTop) {
        container.scrollTop = targetTop - 10;
      } else if (targetTop + targetHeight > scrollTop + containerHeight) {
        container.scrollTop = targetTop + targetHeight - containerHeight + 10;
      }
    }

    this.finished = typedText.length >= this.passage.length;
    return this.finished;
  }

  getStats() {
    return {
      correctCount: this.correctCount,
      incorrectCount: this.incorrectCount,
      totalMistakes: this.totalMistakes,
      totalKeystrokes: this.totalKeystrokes,
      totalChars: this.passage.length,
    };
  }

  getReviewHTML() {
    let html = '';
    for (let i = 0; i < this.spans.length; i++) {
      const char = this.passage[i] === ' ' ? ' ' : this.escapeHTML(this.passage[i]);
      if (i < this.currentIndex) {
        if (this.everIncorrect.has(i)) {
          html += `<span class="char-incorrect">${char}</span>`;
        } else {
          html += `<span class="char-correct">${char}</span>`;
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
