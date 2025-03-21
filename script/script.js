

class Drawer {
    constructor(id) {
        this.canvas = document.getElementById(id);
        this.ctx = this.canvas.getContext("2d");
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        this.drawing = false;
        this.contours = []; // Store multiple contours

        this.canvas.addEventListener("mousedown", this.click.bind(this));
        this.canvas.addEventListener("mousemove", this.move.bind(this));
        this.canvas.addEventListener("mouseup", this.up.bind(this));

        document.getElementById("transformButton").addEventListener("click", this.transform.bind(this));
        document.getElementById("clearButton").addEventListener("click", this.clearCanvas.bind(this));
        document.getElementById("imageUpload").addEventListener("change", this.processImage.bind(this));
    }

    click(e) {
        this.drawing = true;
        this.contours.push([{ x: e.offsetX, y: e.offsetY }]); // Start a new contour
    }

    move(e) {
        if (this.drawing) {
            let lastContour = this.contours[this.contours.length - 1];
            lastContour.push({ x: e.offsetX, y: e.offsetY });
            this.redraw();
        }
    }

    up() {
        this.drawing = false;
    }

    redraw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = 2;

        this.contours.forEach(contour => {
            if (contour.length > 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(contour[0].x, contour[0].y);
                for (let i = 1; i < contour.length; i++) {
                    this.ctx.lineTo(contour[i].x, contour[i].y);
                }
                this.ctx.stroke();
            }
        });
    }

    transform() {
        if (this.contours.length === 0) return;
        this.contours = this.contours.map(contour => this.simplifyPath(contour, 5));
        this.redraw();
    }

    clearCanvas() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.contours = [];
    }

    simplifyPath(points, tolerance) {
        if (points.length < 3) return points;

        function perpendicularDistance(point, lineStart, lineEnd) {
            let dx = lineEnd.x - lineStart.x;
            let dy = lineEnd.y - lineStart.y;
            let mag = dx * dx + dy * dy;
            if (mag === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
            let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / mag;
            t = Math.max(0, Math.min(1, t));
            let closest = { x: lineStart.x + t * dx, y: lineStart.y + t * dy };
            return Math.hypot(point.x - closest.x, point.y - closest.y);
        }

        function rdp(start, end) {
            let maxDist = 0, index = -1;
            for (let i = start + 1; i < end; i++) {
                let dist = perpendicularDistance(points[i], points[start], points[end]);
                if (dist > maxDist) {
                    maxDist = dist;
                    index = i;
                }
            }
            if (maxDist > tolerance) {
                let left = rdp(start, index);
                let right = rdp(index, end);
                return left.slice(0, -1).concat(right);
            } else {
                return [points[start], points[end]];
            }
        }

        return rdp(0, points.length - 1);
    }

    async processImage(event) {
        const file = event.target.files[0];
        if (!file) return;
        const img = new Image();
        img.src = URL.createObjectURL(file);

        img.onload = async () => {
            this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
            const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
            const src = cv.matFromImageData(imageData);

            // Convert to grayscale
            const gray = new cv.Mat();
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

            // Apply Gaussian Blur to smooth noise
            const blurred = new cv.Mat();
            cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

            // Adaptive thresholding for better edge detection
            const binary = new cv.Mat();
            cv.adaptiveThreshold(blurred, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 11, 2);

            // Apply morphological closing to remove small gaps
            const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
            cv.morphologyEx(binary, binary, cv.MORPH_CLOSE, kernel);

            // Detect edges using Canny
            const edges = new cv.Mat();
            cv.Canny(binary, edges, 50, 150);

            // Find and filter contours
            const contours = new cv.MatVector();
            const hierarchy = new cv.Mat();
            cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

            this.contours = [];
            for (let i = 0; i < contours.size(); i++) {
                const contour = contours.get(i);
                const approx = new cv.Mat();
                cv.approxPolyDP(contour, approx, 10, true); // Higher epsilon for smoother shapes

                let contourPoints = [];
                for (let j = 0; j < approx.total(); j++) {
                    let point = approx.intPtr(j);
                    contourPoints.push({ x: point[0], y: point[1] });
                }

                if (contourPoints.length > 3) {
                    this.contours.push(contourPoints);
                }
                approx.delete();
            }

            this.redraw();

            // Clean up
            src.delete();
            gray.delete();
            blurred.delete();
            binary.delete();
            edges.delete();
            contours.delete();
            hierarchy.delete();
            kernel.delete();
        };
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new Drawer("idCanvas");
});







