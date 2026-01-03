#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""Recording management API router"""

import errno
import json
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class RecordingMetadata(BaseModel):
    """Recording file metadata"""
    group: str
    name: str
    path: str
    size: int  # file size in bytes
    created_at: float  # timestamp
    modified_at: float  # timestamp


class SaveRecordingRequest(BaseModel):
    """Request body for saving recording"""
    group: str
    name: str
    data: dict  # RecordingFile structure from frontend


class RecordingListResponse(BaseModel):
    """Response for listing recordings"""
    recordings: List[RecordingMetadata]


class LoadRecordingResponse(BaseModel):
    """Response for loading a recording"""
    data: dict


def get_recordings_root() -> Path:
    """Get the root directory for recordings (~/.buiauto)"""
    home = Path.home()
    recordings_dir = home / ".buiauto"
    recordings_dir.mkdir(parents=True, exist_ok=True)
    return recordings_dir


def get_recording_path(group: str, name: str) -> Path:
    """Get the full path for a recording file with path traversal protection"""
    root = get_recordings_root()

    # Security: Prevent path traversal attacks
    if '..' in group or group.startswith('/') or group.startswith('\\') or '\\' in group:
        raise HTTPException(status_code=400, detail="Invalid group name: path traversal detected")
    if '..' in name or '/' in name or '\\' in name:
        raise HTTPException(status_code=400, detail="Invalid recording name: path traversal detected")

    group_dir = root / group

    # Ensure the resolved path is still under root directory
    try:
        resolved = group_dir.resolve()
        root_resolved = root.resolve()
        if not str(resolved).startswith(str(root_resolved)):
            raise HTTPException(status_code=400, detail="Invalid path: outside recordings directory")
    except (OSError, ValueError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid path: {e}")

    group_dir.mkdir(parents=True, exist_ok=True)

    # Ensure .buiauto.json extension
    if not name.endswith(".buiauto.json"):
        name = f"{name}.buiauto.json"

    return group_dir / name


@router.post("/recordings/save")
async def save_recording(request: SaveRecordingRequest) -> dict:
    """
    Save a recording to the file system

    Path: ~/.buiauto/{group}/{name}.buiauto.json
    """
    try:
        file_path = get_recording_path(request.group, request.name)

        # Save JSON with pretty printing
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(request.data, f, ensure_ascii=False, indent=2)

        logger.info(f"Recording saved: {file_path}")

        return {
            "success": True,
            "path": str(file_path),
            "message": f"Recording saved to {file_path.name}"
        }
    except HTTPException:
        # Path validation errors - re-raise as-is
        raise
    except (OSError, IOError) as e:
        # File system errors (permission denied, disk full, etc.)
        logger.error(f"Failed to save recording {request.name} due to file system error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File system error: {e}")
    except (ValueError, TypeError) as e:
        # Data validation errors
        logger.error(f"Invalid recording data for {request.name}: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Invalid recording data: {e}")


@router.get("/recordings/list")
async def list_recordings() -> RecordingListResponse:
    """
    List all recordings grouped by folder

    Returns all .buiauto.json files in ~/.buiauto/
    """
    try:
        root = get_recordings_root()
        recordings = []

        # Recursively find all .buiauto.json files
        for file_path in root.rglob("*.buiauto.json"):
            stat = file_path.stat()

            # Calculate group (relative path from root)
            relative_path = file_path.relative_to(root)
            group = str(relative_path.parent) if relative_path.parent != Path(".") else "default"

            recordings.append(RecordingMetadata(
                group=group,
                name=file_path.stem.replace(".buiauto", ""),  # Remove .buiauto from stem
                path=str(file_path),
                size=stat.st_size,
                created_at=stat.st_ctime,
                modified_at=stat.st_mtime,
            ))

        # Sort by modified time (newest first)
        recordings.sort(key=lambda x: x.modified_at, reverse=True)

        logger.info(f"Found {len(recordings)} recordings")
        return RecordingListResponse(recordings=recordings)
    except (OSError, IOError) as e:
        # File system errors (permission denied, etc.)
        logger.error(f"Failed to list recordings due to file system error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File system error: {e}")


@router.get("/recordings/load")
async def load_recording(group: str, name: str) -> LoadRecordingResponse:
    """
    Load a specific recording file

    Query params:
    - group: subfolder name
    - name: file name (without .buiauto.json extension)
    """
    try:
        file_path = get_recording_path(group, name)

        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Recording not found: {group}/{name}"
            )

        # Load and parse JSON
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        logger.info(f"Recording loaded: {file_path}")
        return LoadRecordingResponse(data=data)
    except HTTPException:
        # Path validation or 404 errors - re-raise as-is
        raise
    except (OSError, IOError) as e:
        # File system errors
        logger.error(f"Failed to load recording {group}/{name} due to file system error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File system error: {e}")
    except (ValueError, json.JSONDecodeError) as e:
        # Invalid JSON format
        logger.error(f"Failed to parse recording {group}/{name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Invalid recording file format: {e}")


@router.delete("/recordings/delete")
async def delete_recording(group: str, name: str) -> dict:
    """
    Delete a recording file

    Query params:
    - group: subfolder name
    - name: file name (without .buiauto.json extension)
    """
    try:
        file_path = get_recording_path(group, name)

        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"Recording not found: {group}/{name}"
            )

        # Delete file
        file_path.unlink()

        # Try to remove empty group directory
        try:
            file_path.parent.rmdir()
            logger.info(f"Removed empty group directory: {file_path.parent}")
        except OSError as e:
            # Only ignore "directory not empty" errors
            if e.errno in (errno.ENOTEMPTY, errno.EEXIST):
                # Directory not empty, this is expected
                pass
            else:
                # Unexpected error - log it
                logger.warning(f"Failed to remove group directory {file_path.parent}: {e}")

        logger.info(f"Recording deleted: {file_path}")
        return {
            "success": True,
            "message": f"Recording {name} deleted from {group}"
        }
    except HTTPException:
        # Path validation or 404 errors - re-raise as-is
        raise
    except (OSError, IOError) as e:
        # File system errors
        logger.error(f"Failed to delete recording {group}/{name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"File system error: {e}")
