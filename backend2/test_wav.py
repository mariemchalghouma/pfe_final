import os
import wave
import numpy as np
import scipy.io.wavfile as wavfile
from scipy.signal import butter, lfilter

def bandpass_filter(samples, lowcut=300.0, highcut=3400.0, fs=16000.0, order=4):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return lfilter(b, a, samples)

input_file = r"C:\Users\Admin\Downloads\enregistrement_appel.wav"
output_file = r"C:\Users\Admin\Downloads\enregistrement_appel_propre.wav"

if not os.path.exists(input_file):
    print("File not found:", input_file)
    exit(1)

rate, data = wavfile.read(input_file)
print(f"Loaded {input_file} (Rate: {rate}Hz, Channels: {1 if len(data.shape) == 1 else data.shape[1]})")

if len(data.shape) > 1:
    data = data[:, 0]  # Take only one channel if stereo

data = data.astype(np.float32)

# Simple Bandpass
cleaned_data = bandpass_filter(data, lowcut=300.0, highcut=3400.0, fs=rate, order=4)

# Normalization for output
cleaned_data = np.int16(cleaned_data / np.max(np.abs(cleaned_data)) * 32767)

wavfile.write(output_file, rate, cleaned_data)
print(f"Cleaned file saved successfully to: {output_file}")
