import { Request, Response } from 'express';
import FileStorageService from '../utils/FileStorageService';

class FileController {
    public async uploadFile(req: Request, res: Response): Promise<Response> {
        try {
            if (!req.file) {
                throw new Error("Nenhum arquivo enviado.");
            }
            const url = await FileStorageService.save(req.file);
            return res.status(200).json({ url });
        } catch (error: any) {
            return res.status(400).json({ message: `Falha ao fazer o upload da imagem: ${error.message}` });
        }
    }

    public async uploadMultipleFiles(req: Request, res: Response): Promise<Response> {
        try {
            const files = req.files as Express.Multer.File[];
            if (!files || files.length === 0) {
                throw new Error("Nenhum arquivo enviado.");
            }

            const urlsPromises = files.map(file => FileStorageService.save(file));
            const urls = await Promise.all(urlsPromises);
            
            return res.status(200).json({ urls });
        } catch (error: any) {
            return res.status(400).json({ message: `Falha ao fazer o upload das imagens: ${error.message}` });
        }
    }
}

export default new FileController();