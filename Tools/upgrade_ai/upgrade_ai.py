import datetime
import json
import sys

import numpy as np
import cv2

import pytz

from utils.tool_msg import ToolMSG
import utils.env as env

class Upgrade_ai:
    def __init__(self):
        self._tool_msg = ToolMSG(
            'picturas-upgrade-ai-tool-ms',
            'upgrade_ai',
            env.RABBITMQ_HOST,
            env.RABBITMQ_PORT,
            env.RABBITMQ_USERNAME,
            env.RABBITMQ_PASSWORD)
        self._counter = 0
        self._codes = {
            'wrong_procedure': 1800,
            'error_processing': 1801
        }
        self._enhancement_params = {
            "brightness": 1.02,
            "contrast": 1.02,
            "saturation": 1.02,
            "clip_limit": 1.0,
            "tile_grid_size": 32,
            "alpha": 0.8
        }
        self._clahe = None
        self._clahe_clip_limit = None
        self._clahe_tile_grid_size = None
        
    def _get_clahe(self, clip_limit, tile_grid_size):
        if (self._clahe is None or self._clahe_clip_limit != clip_limit
                or self._clahe_tile_grid_size != tile_grid_size):
            self._clahe = cv2.createCLAHE(
                clipLimit=clip_limit,
                tileGridSize=tile_grid_size
            )
            self._clahe_clip_limit = clip_limit
            self._clahe_tile_grid_size = tile_grid_size
        return self._clahe
        
    def apply_clahe(self, image_cv, clip_limit=1.0, tile_grid_size=(32,32), alpha=0.8):
        
        lab = cv2.cvtColor(image_cv, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)

        clahe = self._get_clahe(clip_limit, tile_grid_size)
        cl = clahe.apply(l)

        merged_lab = cv2.merge((cl, a, b))
        enhanced_bgr = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)

        # Blend to reduce over-contrast
        blended = cv2.addWeighted(enhanced_bgr, alpha, image_cv, 1 - alpha, 0)
        return blended

    def decide_enhancement_parameters(self, img_path):
        return self._enhancement_params
        
    def _load_image_cv(self, img_path):
        img_cv = cv2.imread(img_path, cv2.IMREAD_UNCHANGED)
        if img_cv is None:
            raise Exception(f"Failed to read image: {img_path}")
        if len(img_cv.shape) == 2:
            return cv2.cvtColor(img_cv, cv2.COLOR_GRAY2BGR)
        if img_cv.shape[2] == 4:
            return cv2.cvtColor(img_cv, cv2.COLOR_BGRA2BGR)
        return img_cv
        
    def _adjust_saturation(self, image_cv, saturation):
        if saturation == 1.0:
            return image_cv
        hsv = cv2.cvtColor(image_cv, cv2.COLOR_BGR2HSV).astype(np.float32)
        hsv[:, :, 1] *= saturation
        hsv[:, :, 1] = np.clip(hsv[:, :, 1], 0, 255)
        return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)
        
    def _adjust_brightness_contrast(self, image_cv, brightness, contrast):
        img = image_cv.astype(np.float32)
        if brightness != 1.0:
            img *= brightness
        if contrast != 1.0:
            mean = np.mean(img, axis=(0, 1), keepdims=True)
            img = (img - mean) * contrast + mean
        img = np.clip(img, 0, 255)
        return img.astype(np.uint8)
        
    def enhance_image(self, img_path, store_img_path):
        params = self.decide_enhancement_parameters(img_path)
        img_cv = self._load_image_cv(img_path)

        # Apply CLAHE
        enhanced_cv = self.apply_clahe(
            img_cv,
            clip_limit=params["clip_limit"],
            tile_grid_size=(params["tile_grid_size"], params["tile_grid_size"]),
            alpha=params["alpha"]
        )

        enhanced_cv = self._adjust_saturation(
            enhanced_cv,
            saturation=params["saturation"]
        )
        enhanced_cv = self._adjust_brightness_contrast(
            enhanced_cv,
            brightness=params["brightness"],
            contrast=params["contrast"]
        )
        
        if not cv2.imwrite(store_img_path, enhanced_cv):
            raise Exception(f"Failed to write image: {store_img_path}")

    def upgrade_ai_callback(self, ch, method, properties, body):
        json_str = body.decode()
        info = json.loads(json_str)
        msg_id = info['messageId']

        timestamp = datetime.datetime.fromisoformat(info['timestamp'])

        procedure = info['procedure']
        img_path = info['parameters']['inputImageURI']
        store_img_path = info['parameters']['outputImageURI']

        resp_msg_id = f'upgrade-ai-{self._counter}-{msg_id}'
        self._counter += 1

        if procedure != 'upgrade_ai':
            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(
                msg_id, 
                resp_msg_id,
                cur_timestamp,
                'error',
                processing_time,
                None,
                self._codes['wrong_procedure'], 
                "The procedure received does not fit into this tool", 
                img_path
            )
            
            return

        try:
            self.enhance_image(img_path, store_img_path)

            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(
                msg_id,
                resp_msg_id,
                cur_timestamp,
                'success',
                processing_time,
                store_img_path
            )
        except Exception as e:
            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(
                msg_id,
                resp_msg_id,
                cur_timestamp,
                'error',
                processing_time,
                None,
                self._codes['error_processing'],
                str(e),
                img_path
            )

    def exec(self, args):
        while True:
            self._tool_msg.read_msg(self.upgrade_ai_callback)

if __name__ == "__main__":
    upgrade_ai = Upgrade_ai()
    upgrade_ai.exec(sys.argv)
