# Stamp Comparison App

A Next.js web application that allows users to create stamps on a phone screen and compare whether two successive stamps are identical.

## Features

- **Two-panel layout**: Split viewport with left and right stamp areas
- **Multiple stamp shapes**: Circle, square, or freehand drawing
- **Real-time comparison**: Automatic pixel-by-pixel comparison of stamps
- **Adjustable tolerance**: Slider to control matching strictness
- **Mobile-first design**: Optimized for touch interactions
- **Visual feedback**: Clear match/no-match indicators with similarity percentage

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Choose a stamp shape** from the dropdown (circle, square, or freehand)
2. **Create your first stamp** by tapping or dragging on the left canvas
3. **Create your second stamp** by tapping or dragging on the right canvas
4. **View the comparison result** - the app automatically compares stamps
5. **Adjust tolerance** using the slider to make matching more or less strict
6. **Reset** to clear both canvases and start over

## Technical Details

### Architecture

- **Next.js 14** with App Router
- **React 18** with TypeScript
- **Tailwind CSS** for styling
- **HTML5 Canvas** for drawing functionality
- **Client-side only** - no backend required

### Key Components

- `StampCanvas`: Reusable canvas component with drawing capabilities
- `canvasComparison.ts`: Utility functions for pixel-by-pixel comparison
- `page.tsx`: Main application with two-panel layout

### Comparison Algorithm

The app uses a pixel-by-pixel comparison algorithm that:

1. Compares RGB color values with configurable tolerance
2. Compares alpha channel values for transparency matching
3. Calculates similarity percentage based on matching pixels
4. Determines match status based on tolerance threshold

## Development

### Project Structure

```
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── StampCanvas.tsx
├── utils/
│   └── canvasComparison.ts
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Browser Support

- Modern browsers with Canvas API support
- Mobile browsers (iOS Safari, Chrome Mobile)
- Touch and mouse input support

## License

MIT License
