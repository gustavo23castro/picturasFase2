"""
Enhanced MINIMAL performance test - Improved version
"""

import time
import numpy as np
import cv2
import os
from datetime import datetime

print("Enhanced Minimal Performance Test")
print("=" * 50)

# Create test directory
test_dir = "performance_test"
os.makedirs(test_dir, exist_ok=True)

# 1. Create different test images for realistic testing
print("\n1. Creating test images...")
test_images = []

# Test different sizes
sizes = [(600, 800), (720, 1280), (1080, 1920)]  # height, width

for size_idx, (height, width) in enumerate(sizes):
    # Create more realistic image (not pure noise)
    img = np.zeros((height, width, 3), dtype=np.uint8)
    
    # Add gradients (more realistic than pure noise)
    for col in range(width):
        blue_value = int((col / width) * 200) + 55
        img[:, col, 0] = blue_value  # Blue channel
    
    for row in range(height):
        green_value = int((row / height) * 200) + 55
        img[row, :, 1] = green_value  # Green channel
    
    # Add some random texture
    texture = np.random.randint(-30, 30, (height, width, 3), dtype=np.int16)
    img = np.clip(img.astype(np.int16) + texture, 0, 255).astype(np.uint8)
    
    # Save
    filename = os.path.join(test_dir, f"test_{width}x{height}.jpg")
    cv2.imwrite(filename, img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    
    file_size = os.path.getsize(filename) / 1024  # KB
    test_images.append({
        'path': filename,
        'width': width,
        'height': height,
        'size_kb': file_size
    })
    
    print(f"  ✓ {width}x{height}: {file_size:.1f} KB")

# 2. Test CLAHE with object caching (simulate optimization)
print("\n2. Testing CLAHE operations...")
print("-" * 50)

all_results = []

for test_img in test_images:
    print(f"\nTesting {test_img['width']}x{test_img['height']}:")
    
    # Test WITHOUT caching (current implementation)
    times_no_cache = []
    for i in range(3):
        print(f"  Without cache - Run {i+1}/3...", end="", flush=True)
        
        # Load image
        img = cv2.imread(test_img['path'])
        
        start = time.perf_counter()
        
        # Create new CLAHE object each time (current code)
        clahe = cv2.createCLAHE(clipLimit=1.0, tileGridSize=(32, 32))
        
        # Apply CLAHE
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl = clahe.apply(l)
        merged = cv2.merge((cl, a, b))
        result = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        
        end = time.perf_counter()
        elapsed = end - start
        times_no_cache.append(elapsed)
        print(f" {elapsed:.3f}s")
    
    # Test WITH caching (simulated optimization)
    times_with_cache = []
    
    # Create CLAHE object once and reuse (simulating caching)
    cached_clahe = cv2.createCLAHE(clipLimit=1.0, tileGridSize=(32, 32))
    
    for i in range(3):
        print(f"  With cache    - Run {i+1}/3...", end="", flush=True)
        
        # Load image
        img = cv2.imread(test_img['path'])
        
        start = time.perf_counter()
        
        # Use cached CLAHE object
        lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        cl = cached_clahe.apply(l)  # Using cached object
        merged = cv2.merge((cl, a, b))
        result = cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        
        end = time.perf_counter()
        elapsed = end - start
        times_with_cache.append(elapsed)
        print(f" {elapsed:.3f}s")
    
    # Calculate averages
    avg_no_cache = sum(times_no_cache) / len(times_no_cache)
    avg_with_cache = sum(times_with_cache) / len(times_with_cache)
    
    if avg_no_cache > 0:
        improvement = ((avg_no_cache - avg_with_cache) / avg_no_cache) * 100
    else:
        improvement = 0
    
    all_results.append({
        'size': f"{test_img['width']}x{test_img['height']}",
        'no_cache': avg_no_cache,
        'with_cache': avg_with_cache,
        'improvement': improvement
    })
    
    print(f"  Summary:")
    print(f"    Without cache: {avg_no_cache:.3f}s")
    print(f"    With cache:    {avg_with_cache:.3f}s")
    print(f"    Improvement:   {improvement:.1f}%")

# 3. Save detailed results
print("\n3. Saving results...")
results_file = os.path.join(test_dir, "detailed_results.txt")

with open(results_file, "w") as f:
    f.write("=" * 60 + "\n")
    f.write("CLAHE PERFORMANCE TEST RESULTS\n")
    f.write("=" * 60 + "\n\n")
    f.write(f"Test date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"OpenCV version: {cv2.__version__}\n\n")
    
    f.write("Performance Summary:\n")
    f.write("-" * 60 + "\n")
    
    for res in all_results:
        f.write(f"\nImage size: {res['size']}\n")
        f.write(f"  Without caching: {res['no_cache']:.3f} seconds\n")
        f.write(f"  With caching:    {res['with_cache']:.3f} seconds\n")
        f.write(f"  Improvement:     {res['improvement']:.1f}%\n")
    
    f.write("\n" + "=" * 60 + "\n")
    f.write("CONCLUSION\n")
    f.write("=" * 60 + "\n")
    f.write("This test demonstrates the potential performance improvement\n")
    f.write("from implementing CLAHE object caching in upgrade_ai.py\n")


# 4. Create simple CSV for easy comparison
# csv_file = os.path.join(test_dir, "results.csv")
# with open(csv_file, "w") as f:
#     f.write("Image Size,Without Cache (s),With Cache (s),Improvement (%)\n")
#     for res in all_results:
#         f.write(f"{res['size']},{res['no_cache']:.3f},{res['with_cache']:.3f},{res['improvement']:.1f}\n")

# print(f"\n✓ Detailed results saved to: {results_file}")
# print(f"✓ CSV results saved to: {csv_file}")

# 5. Optional: Test parallel processing simulation
print("\n4. Simulating parallel processing benefit...")
print("-" * 50)

# Simulate processing 4 images sequentially vs "parallel" (batch)
single_image_time = all_results[1]['no_cache']  # Use medium size as reference

print(f"Single image processing time: {single_image_time:.3f}s")

# Sequential processing of 4 images
sequential_time = single_image_time * 4
print(f"Sequential 4 images: {sequential_time:.3f}s")

# Simulated "parallel" processing (with overhead)
# In reality, parallel processing would have some overhead
parallel_time = single_image_time * 1.5  # 1.5x instead of 4x
print(f"Parallel 4 images (simulated): {parallel_time:.3f}s")

parallel_improvement = ((sequential_time - parallel_time) / sequential_time) * 100
print(f"Parallel improvement: {parallel_improvement:.1f}%")

# 6. Cleanup
print("\n5. Cleanup...")
keep_files = input("Keep test files? (y/n): ").strip().lower()
if keep_files != 'y':
    import shutil
    shutil.rmtree(test_dir)
    print(f"✓ Removed test directory: {test_dir}")
else:
    print(f"✓ Files kept in: {os.path.abspath(test_dir)}")

print("\n" + "=" * 50)
print("TEST COMPLETE - READY FOR OPTIMIZATION")
print("=" * 50)