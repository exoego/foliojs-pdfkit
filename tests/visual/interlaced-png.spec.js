import { runDocTest } from './helpers';

describe('interlaced PNG (Adam7)', function () {
  test('interlaced grayscale renders correctly', function () {
    return runDocTest(function (doc) {
      doc.font('tests/fonts/Roboto-Regular.ttf');
      doc.fontSize(12);

      doc.text('Interlaced Grayscale PNG (Adam7)', 50, 30);
      doc.image('tests/images/interlaced-grayscale-8bit.png', 50, 50, {
        width: 100,
      });
    });
  });

  test('interlaced RGB renders correctly', function () {
    return runDocTest(function (doc) {
      doc.font('tests/fonts/Roboto-Regular.ttf');
      doc.fontSize(12);

      doc.text('Interlaced RGB PNG (Adam7)', 50, 30);
      doc.image('tests/images/interlaced-rgb-8bit.png', 50, 50, {
        width: 100,
      });
    });
  });

  test('interlaced RGB 16bit renders correctly', function () {
    return runDocTest(function (doc) {
      doc.font('tests/fonts/Roboto-Regular.ttf');
      doc.fontSize(12);

      doc.text('Interlaced RGB 16-bit PNG (Adam7)', 50, 30);
      doc.image('tests/images/interlaced-rgb-16bit.png', 50, 50, {
        width: 100,
      });
    });
  });

  test('interlaced palette renders correctly', function () {
    return runDocTest(function (doc) {
      doc.font('tests/fonts/Roboto-Regular.ttf');
      doc.fontSize(12);

      doc.text('Interlaced Palette PNG (Adam7)', 50, 30);
      doc.image('tests/images/interlaced-pallete-8bit.png', 50, 50, {
        width: 100,
      });
    });
  });

  test('interlaced RGBA renders correctly', function () {
    return runDocTest(function (doc) {
      doc.font('tests/fonts/Roboto-Regular.ttf');
      doc.fontSize(12);

      doc.text('Interlaced RGBA PNG (Adam7)', 50, 30);
      doc.image('tests/images/interlaced-rgb-alpha-8bit.png', 50, 50, {
        width: 100,
      });
    });
  });
});
