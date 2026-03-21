import { useState } from "react";
import { Loader2 } from "lucide-react";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  description: string;
  itemName?: string;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  itemName
}: ConfirmDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div 
        className="fixed inset-0" 
        onClick={() => !isDeleting && onClose()} 
      />
      <div className="relative bg-card border border-border rounded-xl shadow-lg w-full max-w-md p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <h2 className="text-xl font-bold mb-2 text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mb-4">
          {description} {itemName && <span className="font-semibold text-foreground">{itemName}</span>}
        </p>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-md hover:bg-accent/10 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50 flex items-center"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
